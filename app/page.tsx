'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

interface Perfil {
  papel: string
  areas: string[]
}

const areas = [
  {
    id: 'vendas',
    nome: '📋 Vendas',
    descricao: 'Processar pedidos de orçamento',
    icone: '💼',
    cor: 'from-blue-500 to-blue-600',
    ativo: true,
  },
  {
    id: 'financeiro',
    nome: '💰 Financeiro',
    descricao: 'Conciliar extratos bancários',
    icone: '📊',
    cor: 'from-green-500 to-green-600',
    ativo: true,
  },
  {
    id: 'rh',
    nome: '👥 RH',
    descricao: 'Em breve',
    icone: '🎯',
    cor: 'from-purple-500 to-purple-600',
    ativo: false,
  },
  {
    id: 'juridico',
    nome: '⚖️ Jurídico',
    descricao: 'Em breve',
    icone: '📜',
    cor: 'from-red-500 to-red-600',
    ativo: false,
  },
  {
    id: 'operacoes',
    nome: '⚙️ Operações',
    descricao: 'Em breve',
    icone: '🔧',
    cor: 'from-amber-500 to-amber-600',
    ativo: false,
  },
]

export default function HomePage() {
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser({
        email: session.user.email || '',
        id: session.user.id,
      })

      const { data } = await supabase
        .from('perfis')
        .select()
        .eq('id', session.user.id)
        .single()

      if (data) {
        setPerfil(data as Perfil)
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Menu de Áreas"
        usuarioEmail={user?.email}
        mostraAdmin={perfil?.papel === 'admin'}
        mostraLogout
      />

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Boas-vindas */}
        <div className="mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Bem-vindo, {user?.email?.split('@')[0]}! 👋
          </h2>
          <p className="text-gray-600 text-lg">
            Selecione uma área para começar
          </p>
        </div>

        {/* Grid de Áreas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {areas.map((area) => {
            const temAcesso = perfil?.areas.includes(area.id)
            const podeAcessar = area.ativo && temAcesso

            return (
              <button
                key={area.id}
                onClick={() => podeAcessar && router.push(`/${area.id}`)}
                disabled={!podeAcessar}
                className={`
                  relative group rounded-2xl overflow-hidden transition-all duration-300
                  ${podeAcessar ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : 'cursor-not-allowed opacity-60'}
                  ${!area.ativo ? 'opacity-50' : ''}
                `}
              >
                {/* Card Background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${area.cor} opacity-90 group-hover:opacity-100 transition-opacity`}
                ></div>

                {/* Content */}
                <div className="relative p-8 h-64 flex flex-col justify-between text-white">
                  {/* Header */}
                  <div>
                    <div className="text-5xl mb-4">{area.icone}</div>
                    <h3 className="text-2xl font-bold mb-2">{area.nome}</h3>
                    <p className="text-white/90 text-sm leading-relaxed">
                      {area.descricao}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {!area.ativo && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
                        🔒 Em breve
                      </span>
                    )}
                    {area.ativo && !temAcesso && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
                        🚫 Sem acesso
                      </span>
                    )}
                    {podeAcessar && (
                      <span className="inline-flex items-center gap-1 text-white text-sm font-semibold group-hover:translate-x-1 transition-transform">
                        Acessar →
                      </span>
                    )}
                  </div>
                </div>

                {/* Hover effect border */}
                {podeAcessar && (
                  <div className="absolute inset-0 border-2 border-white/0 group-hover:border-white/30 rounded-2xl transition-colors pointer-events-none"></div>
                )}
              </button>
            )
          })}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="text-3xl mb-2">⚡</div>
            <h4 className="font-semibold text-gray-900 mb-1">Rápido</h4>
            <p className="text-sm text-gray-600">Processamento automático com IA</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="text-3xl mb-2">🔒</div>
            <h4 className="font-semibold text-gray-900 mb-1">Seguro</h4>
            <p className="text-sm text-gray-600">Seus dados protegidos sempre</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="text-3xl mb-2">📊</div>
            <h4 className="font-semibold text-gray-900 mb-1">Rastreável</h4>
            <p className="text-sm text-gray-600">Todas as ações registradas</p>
          </div>
        </div>
      </main>
    </div>
  )
}
