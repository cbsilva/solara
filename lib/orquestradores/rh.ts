import { createServerClient } from '@/lib/supabase/server'
import { agente } from '@/lib/agente'

// Limites da empresa para alteracao de faixa salarial (POC).
const REGRAS_RH = {
  variacao_maxima_pct: 15,
  intervalo_minimo_meses: 12,
}

export async function orquestradorRh(id_faixa: string) {
  const supabase = createServerClient()

  // 1. Buscar a faixa
  const { data: faixa } = await supabase
    .from('faixas_salariais')
    .select()
    .eq('id_faixa', id_faixa)
    .single()

  if (!faixa) {
    throw new Error(`Faixa ${id_faixa} não encontrada`)
  }

  // Atualizar para processando
  await supabase
    .from('faixas_salariais')
    .update({ status: 'processando' })
    .eq('id_faixa', id_faixa)

  // Criar execução raiz
  const { data: orquestradorExec } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'rh',
      item_tipo: 'faixa',
      item_id: id_faixa,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { id_faixa },
      inicio: new Date().toISOString(),
    })
    .select()
    .single()

  if (!orquestradorExec) {
    throw new Error('Erro ao criar execução raiz')
  }

  const orquestradorId = orquestradorExec.id

  try {
    // Colaborador (usado por vários agentes)
    const { data: colaboradorData } = await supabase
      .from('colaboradores')
      .select()
      .eq('id_colaborador', faixa.id_colaborador)
      .single()

    const colaborador = {
      id_colaborador: faixa.id_colaborador,
      nome: colaboradorData?.nome || faixa.id_colaborador,
    }

    // 2. TRIADOR
    const triagemResult = await agente(
      'triador',
      {
        justificativa: faixa.justificativa || '',
        colaborador,
        valor_pretendido: Number(faixa.valor),
      },
      { area: 'rh', item_tipo: 'faixa', item_id: id_faixa, chamado_por: orquestradorId }
    )

    const triagem = triagemResult.saida

    // Se não for alteração salarial, criar aprovação e encerrar
    if (triagem.tipo !== 'alteracao_salarial') {
      await supabase.from('aprovacoes').insert({
        area: 'rh',
        item_tipo: 'faixa',
        item_id: id_faixa,
        titulo: `Não é RH: ${triagem.tipo}`,
        proposta: triagem,
        status: 'pendente',
      })

      await supabase
        .from('faixas_salariais')
        .update({ status: 'aguardando_aprovacao' })
        .eq('id_faixa', id_faixa)

      await supabase
        .from('execucoes_agentes')
        .update({ status: 'ok', fim: new Date().toISOString() })
        .eq('id', orquestradorId)

      return
    }

    // 3. PESQUISADOR — consultas em código (sem modelo)
    const { data: faixasAprovadas } = await supabase
      .from('faixas_salariais')
      .select()
      .eq('id_colaborador', faixa.id_colaborador)
      .eq('status', 'aprovada')
      .order('inicio', { ascending: false })

    const faixaAtual = faixasAprovadas?.[0] || null
    const valor_atual = faixaAtual ? Number(faixaAtual.valor) : null
    const valor_pretendido = Number(faixa.valor)
    const variacao_pct =
      valor_atual && valor_atual > 0
        ? Math.round(((valor_pretendido - valor_atual) / valor_atual) * 1000) / 10
        : null

    const pesquisaResult = await agente(
      'pesquisador',
      {
        colaborador: colaboradorData || colaborador,
        valor_atual,
        valor_pretendido,
        variacao_pct,
        faixas_anteriores: (faixasAprovadas || []).map((f: any) => ({
          valor: Number(f.valor),
          inicio: f.inicio,
        })),
      },
      { area: 'rh', item_tipo: 'faixa', item_id: id_faixa, chamado_por: orquestradorId }
    )

    const contexto = pesquisaResult.saida

    // 4. REDATOR
    let redacaoResult = await agente(
      'redator',
      { triagem, contexto, colaborador },
      { area: 'rh', item_tipo: 'faixa', item_id: id_faixa, chamado_por: orquestradorId }
    )

    let redacao = redacaoResult.saida
    let revisoes = 0
    let revisao = null

    // 5. REVISOR (com até 2 voltas)
    while (revisoes < 2) {
      const revisaoResult = await agente(
        'revisor',
        { resposta: redacao.resposta, contexto, regras: REGRAS_RH },
        { area: 'rh', item_tipo: 'faixa', item_id: id_faixa, chamado_por: orquestradorId }
      )

      revisao = revisaoResult.saida

      if (revisao.aprovado) break

      revisoes++
      if (revisoes < 2) {
        redacaoResult = await agente(
          'redator',
          { triagem, contexto, colaborador, ajustes: revisao.motivos },
          { area: 'rh', item_tipo: 'faixa', item_id: id_faixa, chamado_por: orquestradorId }
        )
        redacao = redacaoResult.saida
      }
    }

    // 6. Criar item em aprovacoes
    await supabase.from('aprovacoes').insert({
      area: 'rh',
      item_tipo: 'faixa',
      item_id: id_faixa,
      titulo: `${colaborador.nome} · ${redacao.resumo}`,
      proposta: { resposta: redacao.resposta, triagem, contexto, revisao },
      status: 'pendente',
    })

    await supabase
      .from('faixas_salariais')
      .update({ status: 'aguardando_aprovacao' })
      .eq('id_faixa', id_faixa)

    await supabase
      .from('execucoes_agentes')
      .update({ status: 'ok', fim: new Date().toISOString() })
      .eq('id', orquestradorId)
  } catch (erro) {
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
        fim: new Date().toISOString(),
      })
      .eq('id', orquestradorId)

    await supabase
      .from('faixas_salariais')
      .update({ status: 'nova' })
      .eq('id_faixa', id_faixa)

    throw erro
  }
}
