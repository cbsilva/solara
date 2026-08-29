'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

interface Perfil {
  id: string
  email: string
  nome: string
  papel: string
  areas: string[]
}

const AREAS = ['vendas', 'financeiro', 'rh', 'juridico', 'operacoes']
const PAPEIS = ['admin', 'operador']

export default function AdminPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Formulário
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('operador')
  const [areasForm, setAreasForm] = useState<string[]>([])
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser({ email: session.user.email || '', id: session.user.id })

      const { data: perfil } = await supabase
        .from('perfis')
        .select()
        .eq('id', session.user.id)
        .single()

      if (perfil?.papel !== 'admin') {
        router.push('/')
        return
      }

      const { data } = await supabase
        .from('perfis')
        .select()
        .order('criado_em', { ascending: false })

      if (data) {
        setPerfis(data as Perfil[])
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const handleToggleArea = (area: string) => {
    setAreasForm((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    )
  }

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setSucesso('')
    setCriando(true)

    try {
      if (!email || !senha || !nome || areasForm.length === 0) {
        throw new Error('Preencha todos os campos e selecione pelo menos uma área')
      }

      const res = await fetch('/api/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha, nome, papel, areas: areasForm }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.erro || 'Erro ao criar usuário')
      }

      setSucesso('✅ Usuário criado com sucesso!')
      setEmail('')
      setSenha('')
      setNome('')
      setPapel('operador')
      setAreasForm([])

      const supabase = createClient()
      const { data } = await supabase
        .from('perfis')
        .select()
        .order('criado_em', { ascending: false })

      if (data) {
        setPerfis(data as Perfil[])
      }

      setTimeout(() => setSucesso(''), 3000)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setCriando(false)
    }
  }

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
        titulo="Administração de Usuários"
        usuarioEmail={user?.email}
        mostraLogout
      />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Grid 2 colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulário */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">➕ Criar Novo Usuário</h2>

            <form onSubmit={handleCriarUsuario} className="space-y-6">
              {/* Email */}
              <div>
                <label className="label">📧 Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="input-field"
                  required
                />
              </div>

              {/* Senha */}
              <div>
                <label className="label">🔒 Senha Inicial</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha segura"
                  className="input-field"
                  required
                />
              </div>

              {/* Nome */}
              <div>
                <label className="label">👤 Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                  className="input-field"
                  required
                />
              </div>

              {/* Papel */}
              <div>
                <label className="label">🎭 Papel</label>
                <select
                  value={papel}
                  onChange={(e) => setPapel(e.target.value)}
                  className="input-field"
                >
                  {PAPEIS.map((p) => (
                    <option key={p} value={p}>
                      {p === 'admin' ? '👑 Admin' : '👥 Operador'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Áreas */}
              <div>
                <label className="label">📊 Áreas de Acesso</label>
                <div className="space-y-2">
                  {AREAS.map((area) => (
                    <label
                      key={area}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={areasForm.includes(area)}
                        onChange={() => handleToggleArea(area)}
                        className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                      />
                      <span className="font-medium text-gray-700 capitalize">
                        {area === 'vendas' && '📋 Vendas'}
                        {area === 'financeiro' && '💰 Financeiro'}
                        {area === 'rh' && '👥 RH'}
                        {area === 'juridico' && '⚖️ Jurídico'}
                        {area === 'operacoes' && '⚙️ Operações'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mensagens */}
              {erro && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm font-medium">❌ {erro}</p>
                </div>
              )}
              {sucesso && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-sm font-medium">{sucesso}</p>
                </div>
              )}

              {/* Botão */}
              <button
                type="submit"
                disabled={criando}
                className="w-full btn-primary disabled:opacity-70"
              >
                {criando ? '⏳ Criando...' : '✓ Criar Usuário'}
              </button>
            </form>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 md:px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">👥 Usuários Cadastrados</h2>
              <p className="text-sm text-gray-600 mt-1">Total: {perfis.length}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Nome</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Papel</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Áreas</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        Nenhum usuário cadastrado
                      </td>
                    </tr>
                  ) : (
                    perfis.map((perfil) => (
                      <tr key={perfil.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-gray-900 font-medium">{perfil.email}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{perfil.nome}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                              perfil.papel === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {perfil.papel === 'admin' ? '👑 Admin' : '👥 Operador'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {perfil.areas.map((area) => (
                              <span
                                key={area}
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700"
                              >
                                {area}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
