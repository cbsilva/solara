import { createServerClient, getUsuarioAutenticado } from '@/lib/supabase/server'
import { verificarAdmin } from '@/lib/verificar-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  try {
    const usuario = await getUsuarioAutenticado()
    if (!usuario) {
      return NextResponse.json({ erro: 'Usuário não autenticado' }, { status: 401 })
    }
    await verificarAdmin(usuario.id)

    const { id, nome, papel, areas } = await req.json()

    if (!id || !nome || !papel || !areas || areas.length === 0) {
      return NextResponse.json(
        { erro: 'Preencha todos os campos' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { error } = await supabase
      .from('perfis')
      .update({ nome, papel, areas })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    console.error('Erro ao editar usuário:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao editar usuário' },
      { status: 403 }
    )
  }
}
