import { createServerClient } from '@/lib/supabase/server'
import { agente } from '@/lib/agente'

// Regras da Solara para analise de contrato (POC). Impacto de negocio direto,
// entao sao conferidas em codigo depois do Revisor, nao ficam so no modelo.
const REGRAS_JURIDICO = {
  alcada_valor: 100000,
  comarca_sede: 'Betim/MG',
  multa_moratoria_pct_max: 2,
  juros_mes_pct_max: 1,
  exige_limitacao_responsabilidade: true,
  temas_vetados: ['foro', 'limitacao_responsabilidade', 'exclusividade'],
}

// Minuta muito grande estoura o max_tokens dos agentes e o custo. Limite duro.
const MAX_MINUTA_CHARS = 60000

interface ClausulaPadrao {
  tema: string
  posicao_padrao: string
  limite: Record<string, any> | null
  clausula_vetada: boolean
  fundamento: string | null
}

export async function orquestradorJuridico(id_analise: string) {
  const supabase = createServerClient()

  // 1. Buscar a analise
  const { data: analiseData, error: erroAnalise } = await supabase
    .from('analises_juridicas')
    .select()
    .eq('id_analise', id_analise)

  if (erroAnalise || !analiseData || analiseData.length === 0) {
    throw new Error(`Analise ${id_analise} nao encontrada`)
  }

  const analise = analiseData[0]

  if ((analise.texto_minuta || '').length > MAX_MINUTA_CHARS) {
    throw new Error(`Minuta acima do limite de ${MAX_MINUTA_CHARS} caracteres`)
  }

  // Atualizar para processando
  await supabase
    .from('analises_juridicas')
    .update({ status: 'processando' })
    .eq('id_analise', id_analise)

  // Criar execucao raiz
  const { data: orquestradorExecData, error: erroExec } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'juridico',
      item_tipo: 'analise',
      item_id: id_analise,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { id_analise },
      inicio: new Date().toISOString(),
    })
    .select()

  if (erroExec || !orquestradorExecData || orquestradorExecData.length === 0) {
    throw new Error(`Erro ao criar execucao raiz: ${erroExec?.message || 'Sem dados retornados'}`)
  }

  const orquestradorId = orquestradorExecData[0].id
  const ctx = { area: 'juridico', item_tipo: 'analise', item_id: id_analise, chamado_por: orquestradorId }

  try {
    // 2. TRIADOR
    const triagemResult = await agente(
      'triador',
      {
        texto_minuta: analise.texto_minuta || '',
        contraparte: analise.contraparte,
        tipo_contrato: analise.tipo_contrato,
        valor_envolvido: analise.valor_envolvido != null ? Number(analise.valor_envolvido) : null,
      },
      ctx
    )
    const triagem = triagemResult.saida

    // Se nao for analise de contrato, criar aprovacao e encerrar
    if (triagem.tipo !== 'analise_contrato') {
      await supabase.from('aprovacoes').insert({
        area: 'juridico',
        item_tipo: 'analise',
        item_id: id_analise,
        titulo: `Nao e analise de contrato: ${triagem.tipo}`,
        proposta: triagem,
        status: 'pendente',
      })

      await supabase
        .from('analises_juridicas')
        .update({ status: 'aguardando_aprovacao' })
        .eq('id_analise', id_analise)

      await supabase
        .from('execucoes_agentes')
        .update({ status: 'ok', fim: new Date().toISOString() })
        .eq('id', orquestradorId)

      return
    }

    // 3. PESQUISADOR — parte em codigo (busca a base juridica), parte no modelo (segmenta a minuta)
    const { data: clausulasPadraoData } = await supabase.from('clausulas_padrao').select()
    const clausulasPadrao: ClausulaPadrao[] = (clausulasPadraoData || []) as ClausulaPadrao[]
    const padraoPorTema: Record<string, ClausulaPadrao> = {}
    for (const c of clausulasPadrao) padraoPorTema[c.tema] = c

    const { data: anterioresData } = await supabase
      .from('analises_juridicas')
      .select('id_analise, tipo_contrato, risco_geral, criado_em')
      .eq('contraparte', analise.contraparte)
      .neq('id_analise', id_analise)
      .order('criado_em', { ascending: false })
      .limit(5)

    const pesquisaResult = await agente(
      'pesquisador',
      {
        texto_minuta: analise.texto_minuta || '',
        temas_padrao: clausulasPadrao.map((c) => c.tema),
        contraparte: analise.contraparte,
        analises_anteriores: anterioresData || [],
      },
      ctx
    )
    const pesquisa = pesquisaResult.saida
    const clausulasDetectadas: { tema: string; texto_clausula: string; resumo?: string }[] =
      pesquisa.clausulas || []
    const temasAusentes: string[] = pesquisa.temas_ausentes || []

    // Reprocessamento: limpar clausulas de uma rodada anterior deste item
    await supabase.from('clausulas_analisadas').delete().eq('id_analise', id_analise)

    // Uma linha por clausula detectada + uma por tema ausente relevante
    const temasAusentesRelevantes = temasAusentes.filter(
      (t) => padraoPorTema[t]?.clausula_vetada || REGRAS_JURIDICO.temas_vetados.includes(t)
    )
    const linhasParaInserir = [
      ...clausulasDetectadas.map((c) => ({
        id_analise,
        tema: c.tema,
        texto_clausula: c.texto_clausula || null,
        status: 'nova',
      })),
      ...temasAusentesRelevantes.map((t) => ({
        id_analise,
        tema: t,
        texto_clausula: null,
        status: 'nova',
      })),
    ]

    const { data: linhasInseridas } = await supabase
      .from('clausulas_analisadas')
      .insert(linhasParaInserir)
      .select()

    const linhas = linhasInseridas || []

    await supabase
      .from('clausulas_analisadas')
      .update({ status: 'investigando' })
      .eq('id_analise', id_analise)

    // 4. INVESTIGADOR — um por clausula, todos em paralelo
    const analisesClausulas: any[] = await Promise.all(
      linhas.map(async (linha: any) => {
        const padrao = padraoPorTema[linha.tema]
        const resultado = await agente(
          'investigador',
          {
            tema: linha.tema,
            texto_clausula: linha.texto_clausula,
            tema_ausente: linha.texto_clausula == null,
            posicao_padrao: padrao?.posicao_padrao || '',
            limite: padrao?.limite || null,
            clausula_vetada: padrao?.clausula_vetada || false,
            fundamento: padrao?.fundamento || '',
          },
          ctx
        )
        const saida = resultado.saida
        await supabase
          .from('clausulas_analisadas')
          .update({ classificacao_risco: saida.classificacao_risco, analise: saida })
          .eq('id', linha.id)
        return { tema: linha.tema, texto_clausula: linha.texto_clausula, ...saida }
      })
    )

    // 5. REDATOR (com ate 2 voltas do Revisor)
    let redacaoResult = await agente(
      'redator',
      { triagem, clausulas: analisesClausulas, temas_ausentes: temasAusentes, contraparte: analise.contraparte },
      ctx
    )
    let redacao = redacaoResult.saida
    let revisoes = 0
    let revisao: any = null

    while (revisoes < 2) {
      const revisaoResult = await agente(
        'revisor',
        {
          parecer: redacao.parecer,
          clausulas: analisesClausulas,
          temas_ausentes: temasAusentes,
          regras: REGRAS_JURIDICO,
        },
        ctx
      )
      revisao = revisaoResult.saida

      if (revisao.aprovado) break

      revisoes++
      if (revisoes < 2) {
        redacaoResult = await agente(
          'redator',
          {
            triagem,
            clausulas: analisesClausulas,
            temas_ausentes: temasAusentes,
            contraparte: analise.contraparte,
            ajustes: revisao.motivos,
          },
          ctx
        )
        redacao = redacaoResult.saida
      }
    }

    // 5.1 Checagem deterministica em codigo. Regra de negocio com impacto
    // (foro, teto de responsabilidade, tema vetado, alcada) nao fica so no
    // julgamento do modelo -- conferimos contra as clausulas analisadas.
    const violacoes: string[] = []
    const temAlgumInaceitavel = analisesClausulas.some((c: any) => c.classificacao_risco === 'inaceitavel')

    for (const c of analisesClausulas) {
      if (c.classificacao_risco === 'inaceitavel') {
        violacoes.push(`Clausula "${c.tema}" classificada como inaceitavel: ${c.problema || 's/ detalhe'}`)
      }
      const ehVetado =
        padraoPorTema[c.tema]?.clausula_vetada || REGRAS_JURIDICO.temas_vetados.includes(c.tema)
      if (ehVetado && c.classificacao_risco !== 'alinhada') {
        violacoes.push(`Tema vetado "${c.tema}" fora do padrao da Solara`)
      }
    }

    if (
      REGRAS_JURIDICO.exige_limitacao_responsabilidade &&
      temasAusentes.includes('limitacao_responsabilidade')
    ) {
      violacoes.push('Minuta sem clausula de limitacao de responsabilidade')
    }

    const valor = analise.valor_envolvido != null ? Number(analise.valor_envolvido) : null
    if (valor != null && valor > REGRAS_JURIDICO.alcada_valor) {
      violacoes.push(
        `Valor de R$ ${valor.toFixed(2)} acima da alcada de R$ ${REGRAS_JURIDICO.alcada_valor.toFixed(
          2
        )}: exige aprovacao de socio`
      )
    }

    if (temAlgumInaceitavel && redacao.risco_geral !== 'alto') {
      violacoes.push('Ha clausula inaceitavel, mas o parecer nao marcou risco geral como alto')
    }

    if (violacoes.length > 0) {
      revisao = { aprovado: false, motivos: [...(revisao?.motivos || []), ...violacoes] }
    }

    const riscoGeral =
      violacoes.length > 0 || temAlgumInaceitavel ? 'alto' : redacao.risco_geral || 'medio'

    // 6. Criar item em aprovacoes
    await supabase.from('aprovacoes').insert({
      area: 'juridico',
      item_tipo: 'analise',
      item_id: id_analise,
      titulo: `${analise.contraparte} · risco ${riscoGeral} · ${redacao.resumo}`,
      proposta: {
        parecer: redacao.parecer,
        redlines: redacao.redlines || [],
        ressalvas: redacao.ressalvas || [],
        risco_geral: riscoGeral,
        triagem,
        clausulas: analisesClausulas,
        revisao,
      },
      status: 'pendente',
    })

    await supabase
      .from('analises_juridicas')
      .update({ status: 'aguardando_aprovacao', risco_geral: riscoGeral })
      .eq('id_analise', id_analise)

    await supabase
      .from('clausulas_analisadas')
      .update({ status: 'aguardando_aprovacao' })
      .eq('id_analise', id_analise)

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
      .from('analises_juridicas')
      .update({ status: 'nova' })
      .eq('id_analise', id_analise)

    await supabase
      .from('clausulas_analisadas')
      .update({ status: 'nova' })
      .eq('id_analise', id_analise)

    throw erro
  }
}
