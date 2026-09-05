import { createServerClient } from './supabase/server'

export async function verificarArea(usuarioId: string | undefined, area: string): Promise<boolean> {
  if (!usuarioId) {
    throw new Error('Usuario nao autenticado')
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('perfis')
    .select('areas')
    .eq('id', usuarioId)
    .single()

  if (error || !data) {
    throw new Error('Perfil de usuario nao encontrado')
  }

  if (!data.areas?.includes(area)) {
    throw new Error(`Usuario nao tem acesso a area ${area}`)
  }

  return true
}
