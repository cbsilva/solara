import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, senha, nome, papel, areas } = await req.json()

    // Validar campos
    if (!email || !senha || !nome || !papel) {
      return NextResponse.json(
        { erro: 'Email, senha, nome e papel são obrigatórios' },
        { status: 400 }
      )
    }

    if (!Array.isArray(areas)) {
      return NextResponse.json(
        { erro: 'Áreas deve ser um array' },
        { status: 400 }
      )
    }

    // Criar no Auth com service role
    const supabase = createServerClient()

    const { data: userData, error: erroAuth } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (erroAuth || !userData.user) {
      return NextResponse.json(
        { erro: erroAuth?.message || 'Erro ao criar usuário no Auth' },
        { status: 400 }
      )
    }

    // Criar em perfis
    const { error: erroPerfil } = await supabase
      .from('perfis')
      .insert({
        id: userData.user.id,
        email,
        nome,
        papel,
        areas,
        criado_em: new Date().toISOString(),
      })

    if (erroPerfil) {
      // Se falhar em perfis, deletar do auth
      await supabase.auth.admin.deleteUser(userData.user.id)
      return NextResponse.json(
        { erro: erroPerfil.message || 'Erro ao criar perfil' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      sucesso: true,
      usuario_id: userData.user.id,
    })
  } catch (err) {
    console.error('Erro em criar-usuario:', err)
    return NextResponse.json(
      { erro: 'Erro ao processar solicitação' },
      { status: 500 }
    )
  }
}
