'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/Icon'

interface HeaderProps {
  titulo: string
  usuarioEmail?: string
  mostraAdmin?: boolean
  mostraLogout?: boolean
}

export function Header({ titulo, usuarioEmail, mostraAdmin, mostraLogout }: HeaderProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo e Título */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <Icon type="logo" size="lg" className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Solara OS</h1>
              <p className="text-xs md:text-sm text-gray-500">{titulo}</p>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 md:gap-4">
            {usuarioEmail && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-sm">
                    {usuarioEmail.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-gray-700 font-medium truncate max-w-xs">
                  {usuarioEmail}
                </span>
              </div>
            )}

            {mostraAdmin && (
              <Link
                href="/admin"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 transition-colors"
              >
                <Icon type="admin" size="sm" />
                Admin
              </Link>
            )}

            {mostraLogout && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors"
              >
                <Icon type="sair" size="sm" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}

            {!mostraLogout && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Icon type="voltar" size="sm" />
              </Link>
            )}
          </div>
        </div>

        {/* Email em mobile */}
        {usuarioEmail && (
          <div className="sm:hidden mt-2 text-xs text-gray-600">
            {usuarioEmail}
          </div>
        )}
      </div>
    </header>
  )
}
