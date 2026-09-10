import { createServerClient } from '@/lib/supabase/server'
import { agente } from '@/lib/agente'

// Regras da Solara para reposicao de estoque (POC). Impacto de compra direto,
// entao sao conferidas em codigo depois do Revisor, nao ficam so no modelo.
const REGRAS_OPERACOES = {
  alcada_valor: 50000,
  cobertura_minima_dias: 15,
}

// Tamanho do lote de propostas por chamada ao Consolidador (mesma logica do
// Financeiro: o relatorio inteiro passa facil de max_tokens=2000).
const LOTE_CONSOLIDADOR = 4

interface OrdemCompra {
  cod_fornecedor: string
  itens: { cod_produto: string; quantidade: number; custo_estimado: number }[]
  custo_total: number
  prazo_estimado_dias: number
  urgencia?: string
}

// Junta ordens do mesmo fornecedor que cairam em lotes diferentes.
function mesclarOrdens(ordens: OrdemCompra[]): OrdemCompra[] {
  const porFornecedor: Record<string, OrdemCompra> = {}
  for (const o of ordens) {
    const atual = porFornecedor[o.cod_fornecedor]
    if (!atual) {
      porFornecedor[o.cod_fornecedor] = {
        cod_fornecedor: o.cod_fornecedor,
        itens: [...(o.itens || [])],
        custo_total: Number(o.custo_total) || 0,
        prazo_estimado_dias: Number(o.prazo_estimado_dias) || 0,
        urgencia: o.urgencia,
      }
    } else {
      atual.itens.push(...(o.itens || []))
      atual.custo_total += Number(o.custo_total) || 0
      atual.prazo_estimado_dias = Math.max(atual.prazo_estimado_dias, Number(o.prazo_estimado_dias) || 0)
      if (o.urgencia === 'alta') atual.urgencia = 'alta'
    }
  }
  return Object.values(porFornecedor)
}

async function consolidarEmLotes(
  propostas: any[],
  resumo_ciclo: { total_rupturas: number; valor_total_previsto: number },
  id_ciclo: string,
  orquestradorId: string,
  ajustes?: string[]
): Promise<{ relatorio_markdown: string; ordens: OrdemCompra[] }> {
  const lotes: any[][] = []
  for (let i = 0; i < propostas.length; i += LOTE_CONSOLIDADOR) {
    lotes.push(propostas.slice(i, i + LOTE_CONSOLIDADOR))
  }

  const resultados = await Promise.all(
    lotes.map((lote) =>
      agente(
        'consolidador',
        { resumo_ciclo, propostas: lote, ...(ajustes ? { ajustes } : {}) },
        { area: 'operacoes', item_tipo: 'ruptura', item_id: id_ciclo, chamado_por: orquestradorId }
      )
    )
  )

  const cabecalho =
    `## Plano de reposicao\n\n` +
    `| Indicador | Valor |\n|---|---|\n` +
    `| Rupturas no ciclo | ${resumo_ciclo.total_rupturas} |\n` +
    `| Valor total previsto | R$ ${resumo_ciclo.valor_total_previsto.toFixed(2)} |`

  const trechos = resultados.map((r) => r.saida.relatorio_trecho as string)
  const ordens = mesclarOrdens(resultados.flatMap((r) => (r.saida.ordens as OrdemCompra[]) || []))

  return {
    relatorio_markdown: [cabecalho, ...trechos].join('\n\n---\n\n'),
    ordens,
  }
}

export async function orquestradorOperacoes(id_ciclo: string) {
  const supabase = createServerClient()

  // 1. Buscar rupturas do ciclo (criadas pela rota antes de chamar aqui)
  const { data: rupturas } = await supabase
    .from('itens_ruptura')
    .select()
    .eq('id_ciclo', id_ciclo)
    .eq('status', 'novo')

  if (!rupturas || rupturas.length === 0) {
    throw new Error('Nenhuma ruptura para planejar')
  }

  // Dados de apoio
  const { data: produtos } = await supabase.from('produtos').select()
  const { data: parametros } = await supabase.from('parametros_estoque').select()
  const { data: fornecedores } = await supabase.from('fornecedores').select()

  const produtoPorCod: Record<string, any> = {}
  for (const p of produtos || []) produtoPorCod[p.cod_produto] = p
  const paramPorCod: Record<string, any> = {}
  for (const p of parametros || []) paramPorCod[p.cod_produto] = p
  const fornecedorPorCod: Record<string, any> = {}
  for (const f of fornecedores || []) fornecedorPorCod[f.cod_fornecedor] = f

  // Execucao raiz
  const { data: orquestradorExecData, error: erroExec } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'operacoes',
      item_tipo: 'ruptura',
      item_id: id_ciclo,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { id_ciclo, qtd_rupturas: rupturas.length },
      inicio: new Date().toISOString(),
    })
    .select()

  if (erroExec || !orquestradorExecData || orquestradorExecData.length === 0) {
    throw new Error(`Erro ao criar execucao raiz: ${erroExec?.message || 'Sem dados retornados'}`)
  }

  const orquestradorId = orquestradorExecData[0].id
  const ctx = { area: 'operacoes', item_tipo: 'ruptura', item_id: id_ciclo, chamado_por: orquestradorId }

  try {
    await supabase
      .from('itens_ruptura')
      .update({ status: 'investigando' })
      .eq('id_ciclo', id_ciclo)

    // 2. INVESTIGADOR — um por ruptura, todos em paralelo
    const propostas: any[] = await Promise.all(
      rupturas.map(async (r: any) => {
        const produto = produtoPorCod[r.cod_produto] || {}
        const param = paramPorCod[r.cod_produto] || {}
        const fornecedor = param.cod_fornecedor_preferencial
          ? fornecedorPorCod[param.cod_fornecedor_preferencial] || null
          : null

        const resultado = await agente(
          'investigador',
          {
            produto: {
              cod_produto: r.cod_produto,
              descricao: produto.descricao || r.cod_produto,
              categoria: produto.categoria || null,
              estoque: Number(produto.estoque ?? r.estoque_atual ?? 0),
              preco_unitario: Number(produto.preco_unitario ?? 0),
              preco_acima_100_un: Number(produto.preco_acima_100_un ?? produto.preco_unitario ?? 0),
              prazo_reposicao_dias: Number(produto.prazo_reposicao_dias ?? 0),
            },
            parametros: {
              ponto_reposicao: Number(param.ponto_reposicao ?? r.ponto_reposicao ?? 0),
              estoque_maximo: Number(param.estoque_maximo ?? 0),
              consumo_medio_mensal: Number(param.consumo_medio_mensal ?? 0),
              cod_fornecedor_preferencial: param.cod_fornecedor_preferencial || '',
            },
            cobertura_dias: r.cobertura_dias != null ? Number(r.cobertura_dias) : null,
            fornecedor: fornecedor
              ? {
                  cod_fornecedor: fornecedor.cod_fornecedor,
                  nome: fornecedor.nome,
                  prazo_entrega_dias: Number(fornecedor.prazo_entrega_dias ?? 0),
                  pedido_minimo_valor: Number(fornecedor.pedido_minimo_valor ?? 0),
                  homologado: !!fornecedor.homologado,
                }
              : null,
          },
          ctx
        )

        const saida = resultado.saida
        await supabase
          .from('itens_ruptura')
          .update({ analise: saida })
          .eq('id', r.id)

        return {
          cod_produto: r.cod_produto,
          descricao: produto.descricao || r.cod_produto,
          ...saida,
        }
      })
    )

    // 3. CONSOLIDADOR
    const valor_total_previsto = propostas.reduce((s, p) => s + (Number(p.custo_estimado) || 0), 0)
    const resumo_ciclo = { total_rupturas: rupturas.length, valor_total_previsto }

    let consolidacao = await consolidarEmLotes(propostas, resumo_ciclo, id_ciclo, orquestradorId)
    let revisao: any = null

    // 4. REVISOR (com ate 1 volta refazendo o Consolidador)
    const revisaoResult = await agente(
      'revisor',
      {
        ordens: consolidacao.ordens,
        fornecedores: (fornecedores || []).map((f: any) => ({
          cod_fornecedor: f.cod_fornecedor,
          nome: f.nome,
          pedido_minimo_valor: Number(f.pedido_minimo_valor ?? 0),
          homologado: !!f.homologado,
        })),
        parametros: rupturas.map((r: any) => ({
          cod_produto: r.cod_produto,
          ponto_reposicao: Number(paramPorCod[r.cod_produto]?.ponto_reposicao ?? r.ponto_reposicao ?? 0),
          estoque_maximo: Number(paramPorCod[r.cod_produto]?.estoque_maximo ?? 0),
          estoque_atual: Number(produtoPorCod[r.cod_produto]?.estoque ?? r.estoque_atual ?? 0),
        })),
        regras: REGRAS_OPERACOES,
      },
      ctx
    )
    revisao = revisaoResult.saida

    if (!revisao.aprovado) {
      consolidacao = await consolidarEmLotes(
        propostas,
        resumo_ciclo,
        id_ciclo,
        orquestradorId,
        revisao.motivos
      )
    }

    // 4.1 Checagem deterministica. Regra de compra com impacto (homologacao,
    // pedido minimo, estoque maximo, alcada) nao fica so no julgamento do modelo.
    const violacoes: string[] = []
    for (const ordem of consolidacao.ordens) {
      const f = fornecedorPorCod[ordem.cod_fornecedor]
      if (!f) {
        violacoes.push(`Ordem do fornecedor ${ordem.cod_fornecedor}: fornecedor nao cadastrado`)
        continue
      }
      if (!f.homologado) {
        violacoes.push(`Ordem do fornecedor ${f.nome}: fornecedor nao homologado`)
      }
      const pedidoMinimo = Number(f.pedido_minimo_valor ?? 0)
      if (Number(ordem.custo_total) < pedidoMinimo) {
        violacoes.push(
          `Ordem do fornecedor ${f.nome}: custo total R$ ${Number(ordem.custo_total).toFixed(
            2
          )} abaixo do pedido minimo de R$ ${pedidoMinimo.toFixed(2)}`
        )
      }
      for (const item of ordem.itens || []) {
        const param = paramPorCod[item.cod_produto]
        const estoqueAtual = Number(produtoPorCod[item.cod_produto]?.estoque ?? 0)
        const maximo = Number(param?.estoque_maximo ?? 0)
        if (maximo > 0 && estoqueAtual + Number(item.quantidade) > maximo) {
          violacoes.push(
            `Item ${item.cod_produto}: estoque atual ${estoqueAtual} + quantidade ${item.quantidade} passa do maximo de ${maximo}`
          )
        }
      }
      if (Number(ordem.custo_total) > REGRAS_OPERACOES.alcada_valor) {
        violacoes.push(
          `Ordem do fornecedor ${f.nome}: R$ ${Number(ordem.custo_total).toFixed(
            2
          )} acima da alcada de R$ ${REGRAS_OPERACOES.alcada_valor.toFixed(2)} — exige aprovacao da diretoria`
        )
      }
    }

    if (violacoes.length > 0) {
      revisao = { aprovado: false, motivos: [...(revisao?.motivos || []), ...violacoes] }
    }

    // 5. Uma linha em aprovacoes por ordem (por fornecedor)
    for (const ordem of consolidacao.ordens) {
      const f = fornecedorPorCod[ordem.cod_fornecedor]
      await supabase.from('aprovacoes').insert({
        area: 'operacoes',
        item_tipo: 'ordem',
        item_id: id_ciclo,
        titulo: `${f?.nome || ordem.cod_fornecedor} · ${(ordem.itens || []).length} itens · R$ ${Number(
          ordem.custo_total
        ).toFixed(2)}`,
        proposta: { ordem, relatorio: consolidacao.relatorio_markdown, revisao },
        status: 'pendente',
      })
    }

    await supabase
      .from('itens_ruptura')
      .update({ status: 'aguardando_aprovacao' })
      .eq('id_ciclo', id_ciclo)

    await supabase
      .from('ciclos_reposicao')
      .update({ status: 'aguardando_aprovacao' })
      .eq('id_ciclo', id_ciclo)

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

    await supabase.from('itens_ruptura').update({ status: 'novo' }).eq('id_ciclo', id_ciclo)
    await supabase.from('ciclos_reposicao').update({ status: 'novo' }).eq('id_ciclo', id_ciclo)

    throw erro
  }
}
