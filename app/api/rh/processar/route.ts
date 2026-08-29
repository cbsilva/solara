import { orquestradorRh } from '@/lib/orquestradores/rh'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { id_faixa } = await req.json()

    if (!id_faixa) {
      return NextResponse.json({ erro: 'id_faixa é obrigatório' }, { status: 400 })
    }

    await orquestradorRh(id_faixa)

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    console.error('Erro em processar:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao processar faixa' },
      { status: 500 }
    )
  }
}
