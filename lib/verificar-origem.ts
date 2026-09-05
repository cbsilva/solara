import { NextRequest } from 'next/server'

// Protecao CSRF simples: confere que a requisicao de mutacao (POST/PUT) veio
// do proprio app, comparando o header Origin (ou Referer, como fallback) com
// a origem da propria requisicao. SameSite=Lax nos cookies do Supabase ja
// mitiga a maioria dos casos, mas isso torna a protecao explicita.
export function verificarOrigem(req: NextRequest): boolean {
  const esperado = req.nextUrl.origin

  const origem = req.headers.get('origin')
  if (origem) {
    return origem === esperado
  }

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin === esperado
    } catch {
      return false
    }
  }

  // Sem Origin nem Referer: recusa por padrao.
  return false
}
