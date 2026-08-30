import { orquestradorVendas } from '@/lib/orquestradores/vendas'
import { verificarPermissaoAgente } from '@/lib/verificar-permissao-agente'
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { erro: 'Usuário não autenticado' },
        { status: 401 }
      )
    }

    await verificarPermissaoAgente(user.id)

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
      { status: 403 }
    )
  }
}
