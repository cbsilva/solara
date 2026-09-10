import { orquestradorJuridico } from '@/lib/orquestradores/juridico'
import { verificarPermissaoAgente } from '@/lib/verificar-permissao-agente'
import { verificarArea } from '@/lib/verificar-area'
import { verificarOrigem } from '@/lib/verificar-origem'
import { getUsuarioAutenticado } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    if (!verificarOrigem(req)) {
      return NextResponse.json({ erro: 'Origem nao permitida' }, { status: 403 })
    }

    const user = await getUsuarioAutenticado()

    if (!user) {
      return NextResponse.json({ erro: 'Usuario nao autenticado' }, { status: 401 })
    }

    await verificarArea(user.id, 'juridico')
    await verificarPermissaoAgente(user.id)

    const { id_analise } = await req.json()

    if (!id_analise) {
      return NextResponse.json({ erro: 'id_analise e obrigatorio' }, { status: 400 })
    }

    await orquestradorJuridico(id_analise)

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    console.error('Erro em processar:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao processar analise' },
      { status: 403 }
    )
  }
}
