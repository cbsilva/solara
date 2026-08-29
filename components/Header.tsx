'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/Icon'
import { ThemeToggle } from '@/components/ThemeToggle'

interface HeaderProps {
  /** Subtitulo abaixo de "Solara OS" — o contexto da tela atual. */
  contexto: string
  usuarioEmail?: string
  mostraAdmin?: boolean
  mostraLogout?: boolean
  /** Botao "Inicio" para voltar a home — use nas telas internas. */
  mostraInicio?: boolean
}

export function Header({
  contexto,
  usuarioEmail,
  mostraAdmin,
  mostraLogout,
  mostraInicio,
}: HeaderProps) {
  const router = useRouter()

  const sair = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="topo">
      <div className="container">
        <Link href="/" className="marca">
          <span className="selo" aria-hidden="true">S</span>
          <span>
            Solara OS
            <small>{contexto}</small>
          </span>
        </Link>

        <div className="topo-acoes">
          {usuarioEmail && (
            <span className="topo-usuario">
              <span className="avatar">{usuarioEmail.charAt(0).toUpperCase()}</span>
              {usuarioEmail}
            </span>
          )}

          {mostraInicio && (
            <Link href="/" className="btn btn--secondary btn--sm">
              <Icon type="painel" size="sm" />
              <span className="hidden sm:inline">Início</span>
            </Link>
          )}

          {mostraAdmin && (
            <Link href="/admin" className="btn btn--secondary btn--sm">
              <Icon type="config" size="sm" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          <ThemeToggle />

          {mostraLogout && (
            <button type="button" onClick={sair} className="btn btn--ghost btn--sm">
              <Icon type="sair" size="sm" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>

      {usuarioEmail && <div className="topo-usuario-mobile">{usuarioEmail}</div>}
    </header>
  )
}
