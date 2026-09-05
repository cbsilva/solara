import { createServerClient } from '@/lib/supabase/server'
import { agente } from '@/lib/agente'

interface ClienteInfo {
  cod_cliente: string
  nome: string
  segmento: string
  condicao_pagamento_dias: number
  desconto_maximo_pct: number
}

interface ProdutoCandidat {
  cod_produto: string
  descricao: string
  preco: number
  preco_acima_100: number
  estoque: number
  prazo_reposicao: number
}

export async function orquestradorVendas(cod_pedido: string) {
  const supabase = createServerClient()

  // 1. Buscar pedido
  const { data: pedidosData, error: erroPedido } = await supabase
    .from('pedidos_orcamento')
    .select()
    .eq('cod_pedido', cod_pedido)

  if (erroPedido || !pedidosData || pedidosData.length === 0) {
    throw new Error(`Pedido ${cod_pedido} não encontrado`)
  }

  const pedido = pedidosData[0]

  const { data: clienteData } = await supabase
    .from('clientes')
    .select()
    .eq('cod_cliente', pedido.cod_cliente)
    .single()

  const cliente: ClienteInfo = {
    cod_cliente: pedido.cod_cliente,
    nome: clienteData?.nome || pedido.cod_cliente,
    segmento: clienteData?.segmento || 'N/A',
    condicao_pagamento_dias: clienteData?.prazo_pagamento_dias || 30,
    desconto_maximo_pct: clienteData?.desconto_maximo_pct || 5,
  }

  // Atualizar para processando
  await supabase
    .from('pedidos_orcamento')
    .update({ status: 'processando' })
    .eq('cod_pedido', cod_pedido)

  // Criar execução raiz
  const { data: orquestradorExecData, error: erroExec } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { cod_pedido },
      inicio: new Date().toISOString(),
    })
    .select()

  if (erroExec || !orquestradorExecData || orquestradorExecData.length === 0) {
    throw new Error(`Erro ao criar execução raiz: ${erroExec?.message || 'Sem dados retornados'}`)
  }

  const orquestradorExec = orquestradorExecData[0]

  const orquestradorId = orquestradorExec.id

  try {
    // 2. TRIADOR
    const triagemResult = await agente(
      'triador',
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: cliente.cod_cliente,
          nome: cliente.nome,
          segmento: cliente.segmento,
        },
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestradorId,
      }
    )

    const triagem = triagemResult.saida

    // Se não for orçamento/complemento, criar aprovação e encerrar
    if (triagem.tipo !== 'orcamento' && triagem.tipo !== 'complemento') {
      await supabase.from('aprovacoes').insert({
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        titulo: `Não é orçamento: ${triagem.tipo}`,
        proposta: triagem,
        status: 'pendente',
      })

      await supabase
        .from('pedidos_orcamento')
        .update({ status: 'aguardando_aprovacao' })
        .eq('cod_pedido', cod_pedido)

      await supabase
        .from('execucoes_agentes')
        .update({ status: 'ok', fim: new Date().toISOString() })
        .eq('id', orquestradorId)

      return
    }

    // 3. PESQUISADOR - Consultas em código (sem modelo), em paralelo

    // Catálogo: para cada item do Triador, busca em produtos por similaridade de descrição
    const buscarCandidatosCatalogo = async () => {
      const resultado: Record<string, ProdutoCandidat[]> = {}
      for (const item of triagem.itens) {
        const palavras = item.descricao_cliente
          .toLowerCase()
          .split(/\s+/)
          .filter((p: string) => p.length > 2)

        let query = supabase.from('produtos').select()
        for (const palavra of palavras.slice(0, 2)) {
          query = query.ilike('descricao', `%${palavra}%`)
        }
        const { data: produtos } = await query.limit(5)

        resultado[item.descricao_cliente] = (produtos || []).map((p: any) => ({
          cod_produto: p.cod_produto,
          descricao: p.descricao,
          preco: p.preco_unitario,
          preco_acima_100: p.preco_acima_100_un,
          estoque: p.estoque,
          prazo_reposicao: p.prazo_reposicao_dias || 0,
        }))
      }
      return resultado
    }

    // Cliente: pedidos anteriores do mesmo cliente nos últimos 30 dias
    const buscarPedidosAnteriores = async () => {
      const dataHoje = new Date()
      const data30DiasAtras = new Date(dataHoje.getTime() - 30 * 24 * 60 * 60 * 1000)
      const { data } = await supabase
        .from('pedidos_orcamento')
        .select()
        .eq('cod_cliente', pedido.cod_cliente)
        .gte('data', data30DiasAtras.toISOString())
        .neq('cod_pedido', cod_pedido)
      return data || []
    }

    const [candidatos_catalogo, pedidosAnteriores] = await Promise.all([
      buscarCandidatosCatalogo(),
      buscarPedidosAnteriores(),
    ])

    // Chamar pesquisador
    const pesquisaResult = await agente(
      'pesquisador',
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo,
        cliente,
        pedidos_anteriores: pedidosAnteriores || [],
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestradorId,
      }
    )

    const contexto = pesquisaResult.saida

    // 4. REDATOR
    let redacaoResult = await agente(
      'redator',
      {
        triagem,
        contexto,
        cliente,
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestradorId,
      }
    )

    let redacao = redacaoResult.saida
    let revisoes = 0
    let revisao = null

    // 5. REVISOR (com até 2 voltas)
    while (revisoes < 2) {
      const revisaoResult = await agente(
        'revisor',
        {
          resposta: redacao.resposta,
          contexto,
          regras: {
            prazo_minimo_dias: 2,
            desconto_maximo_pct: cliente.desconto_maximo_pct,
          },
        },
        {
          area: 'vendas',
          item_tipo: 'pedido',
          item_id: cod_pedido,
          chamado_por: orquestradorId,
        }
      )

      revisao = revisaoResult.saida

      if (revisao.aprovado) {
        break
      }

      // Se reprovado, refazer redação
      revisoes++
      if (revisoes < 2) {
        redacaoResult = await agente(
          'redator',
          {
            triagem,
            contexto,
            cliente,
            ajustes: revisao.motivos,
          },
          {
            area: 'vendas',
            item_tipo: 'pedido',
            item_id: cod_pedido,
            chamado_por: orquestradorId,
          }
        )
        redacao = redacaoResult.saida
      }
    }

    // 5.1 Validacao deterministica de preco/desconto/estoque. As regras de
    // negocio com impacto financeiro nao ficam so no julgamento do modelo
    // (revisor) -- conferimos de novo em codigo contra os dados reais do
    // catalogo antes de mandar para a fila de aprovacao.
    const catalogoPorCodigo: Record<string, ProdutoCandidat> = {}
    for (const lista of Object.values(candidatos_catalogo)) {
      for (const p of lista) catalogoPorCodigo[p.cod_produto] = p
    }

    const violacoes: string[] = []
    for (const item of contexto.itens || []) {
      if (!item.existe || !item.cod_produto) continue
      const real = catalogoPorCodigo[item.cod_produto]
      if (!real) continue

      const precoBase = item.quantidade > 100 ? real.preco_acima_100 : real.preco
      const precoMinimo = precoBase * (1 - cliente.desconto_maximo_pct / 100)

      if (item.preco_aplicado > precoBase * 1.01) {
        violacoes.push(
          `Preço aplicado de ${item.cod_produto} (R$ ${item.preco_aplicado}) é maior que o preço de tabela (R$ ${precoBase.toFixed(2)})`
        )
      } else if (item.preco_aplicado < precoMinimo * 0.99) {
        violacoes.push(
          `Desconto de ${item.cod_produto} excede o máximo do cliente (${cliente.desconto_maximo_pct}%)`
        )
      }

      if (item.atende_estoque && item.quantidade > real.estoque) {
        violacoes.push(
          `${item.cod_produto}: promete estoque para ${item.quantidade} un, mas só há ${real.estoque} em estoque`
        )
      }
    }

    if (violacoes.length > 0) {
      revisao = { aprovado: false, motivos: [...(revisao?.motivos || []), ...violacoes] }
    }

    // 6. Criar item em aprovacoes
    await supabase.from('aprovacoes').insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      titulo: `${cliente.nome} · ${redacao.resumo}`,
      proposta: {
        resposta: redacao.resposta,
        triagem,
        contexto,
        revisao,
      },
      status: 'pendente',
    })

    // Atualizar pedido para aguardando_aprovacao
    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'aguardando_aprovacao' })
      .eq('cod_pedido', cod_pedido)

    // Encerrar execução raiz
    await supabase
      .from('execucoes_agentes')
      .update({ status: 'ok', fim: new Date().toISOString() })
      .eq('id', orquestradorId)
  } catch (erro) {
    // Se errar, marcar execução como erro e atualizar pedido
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
        fim: new Date().toISOString(),
      })
      .eq('id', orquestradorId)

    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'novo' })
      .eq('cod_pedido', cod_pedido)

    throw erro
  }
}
