import { createServerClient } from './supabase/server'

export async function verificarPermissaoAgente(usuarioId: string | undefined): Promise<boolean> {
  if (!usuarioId) {
    throw new Error('Usuario nao autenticado')
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('perfis_usuario')
    .select('usar_agente')
    .eq('id', usuarioId)
    .single()

  if (error || !data) {
    throw new Error('Perfil de usuario nao encontrado')
  }

  if (!data.usar_agente) {
    throw new Error('Uso de agentes desabilitado para seu usuario. Contate o administrador.')
  }

  return true
}
