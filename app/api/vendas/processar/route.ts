import { orquestradorVendas } from '@/lib/orquestradores/vendas'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { cod_pedido } = await req.json()

    if (!cod_pedido) {
      return NextResponse.json(
        { erro: 'cod_pedido é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorVendas(cod_pedido)

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    console.error('Erro em processar:', err)
    return NextResponse.json(
      {
        erro:
          err instanceof Error ? err.message : 'Erro ao processar pedido',
      },
      { status: 500 }
    )
  }
}
