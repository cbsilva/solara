import { orquestradorOperacoes } from '@/lib/orquestradores/operacoes'
import { verificarPermissaoAgente } from '@/lib/verificar-permissao-agente'
import { verificarArea } from '@/lib/verificar-area'
import { verificarOrigem } from '@/lib/verificar-origem'
import { getUsuarioAutenticado, createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Varre produtos x parametros_estoque e devolve os que estao abaixo do ponto
// de reposicao, ja com a cobertura em dias calculada (codigo, sem modelo).
async function detectarRupturas(supabase: ReturnType<typeof createServerClient>) {
  const { data: produtos } = await supabase.from('produtos').select()
  const { data: parametros } = await supabase.from('parametros_estoque').select()

  const paramPorCod: Record<string, any> = {}
  for (const p of parametros || []) paramPorCod[p.cod_produto] = p

  const rupturas: {
    cod_produto: string
    estoque_atual: number
    ponto_reposicao: number
    cobertura_dias: number | null
  }[] = []

  for (const produto of produtos || []) {
    const param = paramPorCod[produto.cod_produto]
    if (!param) continue
    const estoque = Number(produto.estoque ?? 0)
    const ponto = Number(param.ponto_reposicao ?? 0)
    if (estoque >= ponto) continue

    const consumoMes = Number(param.consumo_medio_mensal ?? 0)
    const cobertura = consumoMes > 0 ? Math.round((estoque / (consumoMes / 30)) * 10) / 10 : null

    rupturas.push({
      cod_produto: produto.cod_produto,
      estoque_atual: estoque,
      ponto_reposicao: ponto,
      cobertura_dias: cobertura,
    })
  }

  return rupturas
}

async function proximoIdCiclo(supabase: ReturnType<typeof createServerClient>) {
  const { data } = await supabase
    .from('ciclos_reposicao')
    .select('id_ciclo')
    .order('id_ciclo', { ascending: false })
    .limit(1)

  if (data && data.length > 0) {
    const n = parseInt(data[0].id_ciclo.replace('CR', ''))
    return `CR${String(n + 1).padStart(3, '0')}`
  }
  return 'CR001'
}

export async function POST(req: NextRequest) {
  try {
    if (!verificarOrigem(req)) {
      return NextResponse.json({ erro: 'Origem nao permitida' }, { status: 403 })
    }

    const user = await getUsuarioAutenticado()
    if (!user) {
      return NextResponse.json({ erro: 'Usuario nao autenticado' }, { status: 401 })
    }

    await verificarArea(user.id, 'operacoes')
    await verificarPermissaoAgente(user.id)

    const body = await req.json().catch(() => ({}))
    const supabase = createServerClient()

    let id_ciclo: string = body?.id_ciclo

    if (id_ciclo) {
      // Reprocessar: limpar rupturas e aprovacoes da rodada anterior
      await supabase.from('itens_ruptura').delete().eq('id_ciclo', id_ciclo)
      await supabase.from('aprovacoes').delete().eq('area', 'operacoes').eq('item_id', id_ciclo)
      await supabase.from('ciclos_reposicao').update({ status: 'novo' }).eq('id_ciclo', id_ciclo)
    }

    const rupturas = await detectarRupturas(supabase)

    if (!id_ciclo) {
      id_ciclo = await proximoIdCiclo(supabase)
      await supabase.from('ciclos_reposicao').insert({
        id_ciclo,
        disparado_por: user.id,
        total_rupturas: rupturas.length,
        status: rupturas.length > 0 ? 'planejando' : 'concluido',
      })
    } else {
      await supabase
        .from('ciclos_reposicao')
        .update({
          total_rupturas: rupturas.length,
          status: rupturas.length > 0 ? 'planejando' : 'concluido',
        })
        .eq('id_ciclo', id_ciclo)
    }

    if (rupturas.length === 0) {
      return NextResponse.json({ sucesso: true, id_ciclo, rupturas: 0 })
    }

    await supabase.from('itens_ruptura').insert(
      rupturas.map((r) => ({
        id_ciclo,
        cod_produto: r.cod_produto,
        estoque_atual: r.estoque_atual,
        ponto_reposicao: r.ponto_reposicao,
        cobertura_dias: r.cobertura_dias,
        status: 'novo',
      }))
    )

    await orquestradorOperacoes(id_ciclo)

    return NextResponse.json({ sucesso: true, id_ciclo, rupturas: rupturas.length })
  } catch (err) {
    console.error('Erro em planejar:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao planejar reposicao' },
      { status: 403 }
    )
  }
}
