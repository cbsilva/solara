import { createServerClient } from '@/lib/supabase/server'
import { agente } from '@/lib/agente'

interface Divergencia {
  id: string
  lancamento_id: string
  cod_titulo: string | null
  valor_lancamento: number
  valor_titulo: number | null
  tipo_inicial: string
}

interface Titulo {
  cod_titulo: string
  valor: number
  status: string
}

export async function orquestradorFinanceiro(extrato_id: string) {
  const supabase = createServerClient()

  // 1. Buscar divergências
  const { data: divergencias } = await supabase
    .from('divergencias')
    .select()
    .eq('extrato_id', extrato_id)
    .eq('status', 'nova')

  if (!divergencias || divergencias.length === 0) {
    throw new Error('Nenhuma divergência para investigar')
  }

  // Buscar lançamentos e títulos para contexto
  const { data: lancamentos } = await supabase
    .from('lancamentos')
    .select()
    .eq('extrato_id', extrato_id)

  const { data: titulos } = await supabase
    .from('titulos_receber')
    .select()
    .eq('status', 'aberto')

  // Criar execução raiz
  const { data: orquestradorExecData, error: erroExec } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: extrato_id,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { extrato_id, qtd_divergencias: divergencias.length },
      inicio: new Date().toISOString(),
    })
    .select()

  if (erroExec || !orquestradorExecData || orquestradorExecData.length === 0) {
    throw new Error(`Erro ao criar execução raiz: ${erroExec?.message || 'Sem dados retornados'}`)
  }

  const orquestradorExec = orquestradorExecData[0]
  const orquestradorId = orquestradorExec.id

  try {
    // Atualizar divergências para investigando
    await supabase
      .from('divergencias')
      .update({ status: 'investigando' })
      .in(
        'id',
        divergencias.map((d) => d.id)
      )

    // 2. INVESTIGADOR - em paralelo para cada divergência
    const promessasInvestigador = divergencias.map(async (div) => {
      const lancamento = lancamentos?.find((l) => l.id === div.lancamento_id)
      const titulo = titulos?.find((t) => t.cod_titulo === div.cod_titulo)

      // Buscar títulos candidatos (mesmo cliente ou valor próximo)
      const titulos_candidatos = titulos?.filter((t) => {
        if (!t.status || t.status !== 'aberto') return false
        // Valor próximo (±10%)
        const diferenca = Math.abs(t.valor - div.valor_lancamento)
        return diferenca <= div.valor_lancamento * 0.1
      })

      const resultado = await agente(
        'investigador',
        {
          divergencia: {
            id: div.id,
            valor_lancamento: div.valor_lancamento,
            valor_titulo: div.valor_titulo,
            tipo_inicial: div.tipo_inicial,
          },
          lancamento: {
            data: lancamento?.data,
            descricao: lancamento?.descricao,
            valor: lancamento?.valor,
          },
          titulos_candidatos: titulos_candidatos || [],
        },
        {
          area: 'financeiro',
          item_tipo: 'divergencia',
          item_id: extrato_id,
          chamado_por: orquestradorId,
        }
      )

      return resultado.saida
    })

    const hipoteses = await Promise.all(promessasInvestigador)

    // 3. CONSOLIDADOR
    const qtd_casados = lancamentos?.filter((l) => l.situacao === 'casado').length || 0
    const valor_casado =
      lancamentos
        ?.filter((l) => l.situacao === 'casado')
        .reduce((sum, l) => sum + (l.valor || 0), 0) || 0

    const consolidadorResult = await agente(
      'consolidador',
      {
        resumo_casamento: {
          qtd_casados,
          valor_casado,
          qtd_divergencias: divergencias.length,
          valor_divergente: divergencias.reduce((sum, d) => sum + (d.valor_lancamento || 0), 0),
        },
        hipoteses,
      },
      {
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extrato_id,
        chamado_por: orquestradorId,
      }
    )

    let consolidacao = consolidadorResult.saida
    let revisao = null

    // 4. REVISOR
    const revisiorResult = await agente(
      'revisor',
      {
        hipoteses,
        titulos_abertos: titulos || [],
        relatorio: consolidacao.relatorio_markdown,
      },
      {
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extrato_id,
        chamado_por: orquestradorId,
      }
    )

    revisao = revisiorResult.saida

    // Se reprovado, refazer Consolidador uma vez
    if (!revisao.aprovado) {
      const consolidadorResult2 = await agente(
        'consolidador',
        {
          resumo_casamento: {
            qtd_casados,
            valor_casado,
            qtd_divergencias: divergencias.length,
            valor_divergente: divergencias.reduce((sum, d) => sum + (d.valor_lancamento || 0), 0),
          },
          hipoteses,
          ajustes: revisao.motivos,
        },
        {
          area: 'financeiro',
          item_tipo: 'divergencia',
          item_id: extrato_id,
          chamado_por: orquestradorId,
        }
      )

      consolidacao = consolidadorResult2.saida
    }

    // 5. Criar items em aprovacoes (uma por hipótese)
    for (const hipotese of hipoteses) {
      const titulo_aprovacao = `${hipotese.hipotese} · ${hipotese.acao_sugerida} · R$ ${hipotese.valor_a_baixar}`

      await supabase.from('aprovacoes').insert({
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extrato_id,
        titulo: titulo_aprovacao,
        proposta: {
          hipotese,
          relatorio: consolidacao.relatorio_markdown,
          revisao,
        },
        status: 'pendente',
      })
    }

    // Atualizar divergências para aguardando_aprovacao
    await supabase
      .from('divergencias')
      .update({ status: 'aguardando_aprovacao' })
      .in(
        'id',
        divergencias.map((d) => d.id)
      )

    // Encerrar execução raiz
    await supabase
      .from('execucoes_agentes')
      .update({ status: 'ok', fim: new Date().toISOString() })
      .eq('id', orquestradorId)
  } catch (erro) {
    // Se errar, marcar execução como erro
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
        fim: new Date().toISOString(),
      })
      .eq('id', orquestradorId)

    // Voltar divergências para nova
    await supabase
      .from('divergencias')
      .update({ status: 'nova' })
      .in(
        'id',
        (divergencias || []).map((d) => d.id)
      )

    throw erro
  }
}
