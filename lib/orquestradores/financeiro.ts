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

// Tamanho do lote de hipoteses por chamada ao Consolidador. O relatorio
// completo (varias divergencias, cada uma com tabela/explicacao) facilmente
// passa de max_tokens=2000 numa chamada so; em vez de aumentar max_tokens
// (fixo no SPEC), o Consolidador roda em paralelo sobre lotes pequenos e o
// relatorio final e montado em codigo, concatenando os trechos.
const LOTE_CONSOLIDADOR = 3

async function consolidarEmLotes(
  hipoteses: any[],
  resumo_casamento: { qtd_casados: number; valor_casado: number; qtd_divergencias: number; valor_divergente: number },
  extrato_id: string,
  orquestradorId: string,
  ajustes?: string[]
): Promise<{ relatorio_markdown: string; acoes: any[] }> {
  const lotes: any[][] = []
  for (let i = 0; i < hipoteses.length; i += LOTE_CONSOLIDADOR) {
    lotes.push(hipoteses.slice(i, i + LOTE_CONSOLIDADOR))
  }

  const resultados = await Promise.all(
    lotes.map((lote) =>
      agente(
        'consolidador',
        {
          resumo_casamento,
          hipoteses: lote,
          ...(ajustes ? { ajustes } : {}),
        },
        {
          area: 'financeiro',
          item_tipo: 'divergencia',
          item_id: extrato_id,
          chamado_por: orquestradorId,
        }
      )
    )
  )

  const cabecalho =
    `## Resumo da conciliação\n\n` +
    `| Indicador | Quantidade | Valor |\n|---|---|---|\n` +
    `| Casados | ${resumo_casamento.qtd_casados} | R$ ${resumo_casamento.valor_casado.toFixed(2)} |\n` +
    `| Divergências | ${resumo_casamento.qtd_divergencias} | R$ ${resumo_casamento.valor_divergente.toFixed(2)} |`

  const trechos = resultados.map((r) => r.saida.relatorio_trecho as string)
  const acoes = resultados
    .flatMap((r) => (r.saida.acoes as any[]) || [])
    .map((acao, idx) => ({ ordem: idx + 1, ...acao }))

  return {
    relatorio_markdown: [cabecalho, ...trechos].join('\n\n---\n\n'),
    acoes,
  }
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

    const resumo_casamento = {
      qtd_casados,
      valor_casado,
      qtd_divergencias: divergencias.length,
      valor_divergente: divergencias.reduce((sum, d) => sum + (d.valor_lancamento || 0), 0),
    }

    let consolidacao = await consolidarEmLotes(hipoteses, resumo_casamento, extrato_id, orquestradorId)
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
      consolidacao = await consolidarEmLotes(
        hipoteses,
        resumo_casamento,
        extrato_id,
        orquestradorId,
        revisao.motivos
      )
    }

    // 5. Criar items em aprovacoes (uma por hipótese)
    for (let i = 0; i < hipoteses.length; i++) {
      const hipotese = hipoteses[i]
      const divergencia = divergencias[i]
      const titulo_aprovacao = `${hipotese.hipotese} · ${hipotese.acao_sugerida} · R$ ${hipotese.valor_a_baixar}`

      await supabase.from('aprovacoes').insert({
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extrato_id,
        titulo: titulo_aprovacao,
        proposta: {
          divergencia_id: divergencia.id,
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
