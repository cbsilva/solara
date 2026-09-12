import { createServerClient } from './supabase/server'

export async function verificarAdmin(usuarioId: string | undefined): Promise<boolean> {
  if (!usuarioId) {
    throw new Error('Usuario nao autenticado')
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('perfis')
    .select('papel')
    .eq('id', usuarioId)
    .single()

  if (error || !data) {
    throw new Error('Perfil de usuario nao encontrado')
  }

  if (data.papel !== 'admin') {
    throw new Error('Acesso restrito a administradores')
  }

  return true
}

// Igual a verificarAdmin, mas tambem recusa o usuario demo ("admin sem
// poderes" — papel = 'admin', demo = true). Use nas rotas que executam uma
// acao de verdade (criar/editar usuario); rotas so de leitura podem continuar
// usando verificarAdmin, que o demo passa.
export async function verificarAdminReal(usuarioId: string | undefined): Promise<boolean> {
  if (!usuarioId) {
    throw new Error('Usuario nao autenticado')
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('perfis')
    .select('papel, demo')
    .eq('id', usuarioId)
    .single()

  if (error || !data) {
    throw new Error('Perfil de usuario nao encontrado')
  }

  if (data.papel !== 'admin') {
    throw new Error('Acesso restrito a administradores')
  }

  if (data.demo) {
    throw new Error('Usuario demo nao pode executar esta acao')
  }

  return true
}
