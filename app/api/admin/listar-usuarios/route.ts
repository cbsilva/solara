import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createServerClient()

    // Listar todos os usuários do auth
    const { data: { users }, error: erroAuth } = await supabase.auth.admin.listUsers()

    if (erroAuth) throw erroAuth

    // Buscar permissões existentes
    const { data: perfis, error: erroPerfis } = await supabase
      .from('perfis_usuario')
      .select('id, usar_agente')

    if (erroPerfis) throw erroPerfis

    // Combinar dados
    const perfisMap = new Map(perfis?.map((p: any) => [p.id, p.usar_agente]) || [])

    const usuariosFormatados = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      usar_agente: perfisMap.get(u.id) || false,
    }))

    return NextResponse.json(usuariosFormatados.sort((a, b) => a.email.localeCompare(b.email)))
  } catch (err) {
    console.error('Erro ao listar usuários:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}
