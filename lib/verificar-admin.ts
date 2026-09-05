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
