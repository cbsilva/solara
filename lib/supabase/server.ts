import { createClient } from '@supabase/supabase-js'
import { createServerClient as criarClienteSsr } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )
}

// Le a sessao do usuario a partir dos cookies da requisicao. O cliente de
// createServerClient() usa a service role e nao tem acesso a sessao alguma,
// entao supabase.auth.getUser() nele sempre devolve null.
export async function getUsuarioAutenticado() {
  const cookieStore = await cookies()
  const supabase = criarClienteSsr(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesParaDefinir) {
          cookiesParaDefinir.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
