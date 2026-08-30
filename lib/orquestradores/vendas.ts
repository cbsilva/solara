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
          cod_cliente: pedido.cod_cliente,
          nome: pedido.cliente_nome,
          segmento: pedido.cliente_segmento,
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

    // 3. PESQUISADOR - Consultas em código (sem modelo)
    const { data: clienteData } = await supabase
      .from('clientes')
      .select()
      .eq('cod_cliente', pedido.cod_cliente)
      .single()

    const cliente: ClienteInfo = {
      cod_cliente: pedido.cod_cliente,
      nome: pedido.cliente_nome || clienteData?.nome || pedido.cod_cliente,
      segmento: pedido.cliente_segmento || clienteData?.segmento || 'N/A',
      condicao_pagamento_dias: clienteData?.condicao_pagamento_dias || 30,
      desconto_maximo_pct: clienteData?.desconto_maximo_pct || 5,
    }

    // Buscar pedidos anteriores (últimos 30 dias)
    const dataHoje = new Date()
    const data30DiasAtras = new Date(dataHoje.getTime() - 30 * 24 * 60 * 60 * 1000)

    const { data: pedidosAnteriores } = await supabase
      .from('pedidos_orcamento')
      .select()
      .eq('cod_cliente', pedido.cod_cliente)
      .gte('data', data30DiasAtras.toISOString())
      .neq('cod_pedido', cod_pedido)

    // Buscar candidatos para cada item (similaridade de descrição)
    const candidatos_catalogo: Record<string, ProdutoCandidat[]> = {}

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

      candidatos_catalogo[item.descricao_cliente] = (produtos || []).map(
        (p: any) => ({
          cod_produto: p.cod_produto,
          descricao: p.descricao,
          preco: p.preco,
          estoque: p.estoque,
          prazo_reposicao: p.prazo_reposicao || 0,
        })
      )
    }

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
