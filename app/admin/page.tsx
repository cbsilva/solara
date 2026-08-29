'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [user, setUser] = useState<{ email: string } | null>(null)
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

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser({ email: session.user.email || '' })

      // Verificar se é admin
      const { data: perfil } = await supabase
        .from('perfis')
        .select()
        .eq('id', session.user.id)
        .single()

      if (perfil?.papel !== 'admin') {
        router.push('/')
        return
      }

      // Buscar todos os perfis
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
    setCriando(true)

    try {
      const res = await fetch('/api/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          senha,
          nome,
          papel,
          areas: areasForm,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.erro || 'Erro ao criar usuário')
      }

      // Limpar formulário
      setEmail('')
      setSenha('')
      setNome('')
      setPapel('operador')
      setAreasForm([])

      // Atualizar lista
      const supabase = createClient()
      const { data } = await supabase
        .from('perfis')
        .select()
        .order('criado_em', { ascending: false })

      if (data) {
        setPerfis(data as Perfil[])
      }
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : 'Erro ao criar usuário'
      )
    } finally {
      setCriando(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>Carregando...</div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Administração</h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Admin: {user?.email}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Formulário */}
        <div>
          <h2>Criar Usuário</h2>
          <form onSubmit={handleCriarUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Senha Inicial
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Nome
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
                Papel
              </label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Áreas
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {AREAS.map((area) => (
                  <label key={area} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={areasForm.includes(area)}
                      onChange={() => handleToggleArea(area)}
                    />
                    {area}
                  </label>
                ))}
              </div>
            </div>

            {erro && (
              <div style={{ color: '#d32f2f', fontSize: '14px' }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={criando}
              style={{
                padding: '10px',
                backgroundColor: criando ? '#ccc' : '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: criando ? 'default' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {criando ? 'Criando...' : 'Criar Usuário'}
            </button>
          </form>
        </div>

        {/* Tabela */}
        <div>
          <h2>Usuários</h2>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Email
                  </th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Nome
                  </th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Papel
                  </th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Áreas
                  </th>
                </tr>
              </thead>
              <tbody>
                {perfis.map((perfil) => (
                  <tr key={perfil.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>{perfil.email}</td>
                    <td style={{ padding: '10px' }}>{perfil.nome}</td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          backgroundColor: perfil.papel === 'admin' ? '#ff9800' : '#2196f3',
                          color: 'white',
                          borderRadius: '3px',
                          fontSize: '12px',
                        }}
                      >
                        {perfil.papel}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px' }}>
                      {perfil.areas.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
