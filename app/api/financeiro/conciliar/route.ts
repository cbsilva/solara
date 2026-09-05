import { orquestradorFinanceiro } from '@/lib/orquestradores/financeiro'
import { verificarPermissaoAgente } from '@/lib/verificar-permissao-agente'
import { getUsuarioAutenticado } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const user = await getUsuarioAutenticado()

    if (!user) {
      return NextResponse.json(
        { erro: 'Usuário não autenticado' },
        { status: 401 }
      )
    }

    await verificarPermissaoAgente(user.id)

    const { extrato_id } = await req.json()

    if (!extrato_id) {
      return NextResponse.json(
        { erro: 'extrato_id é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorFinanceiro(extrato_id)

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    console.error('Erro em conciliar:', err)
    return NextResponse.json(
      {
        erro:
          err instanceof Error ? err.message : 'Erro ao conciliar extrato',
      },
      { status: 403 }
    )
  }
}
