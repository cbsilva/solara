'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface Perfil {
  id: string
  email: string
  nome: string
  papel: string
  areas: string[]
}

const AREAS = ['vendas', 'financeiro', 'rh', 'juridico', 'operacoes']
const PAPEIS = ['operador', 'admin']

export default function AdminPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('operador')
  const [areasForm, setAreasForm] = useState<string[]>([])
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    const verificar = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({ email: session.user.email || '', id: session.user.id })

      const { data: perfil } = await supabase.from('perfis').select().eq('id', session.user.id).single()
      if (perfil?.papel !== 'admin') {
        router.push('/')
        return
      }

      await buscarPerfis()
      setCarregando(false)
    }
    verificar()
  }, [router])

  const buscarPerfis = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('perfis').select().order('criado_em', { ascending: false })
    if (data) setPerfis(data as Perfil[])
  }

  const alternarArea = (area: string) => {
    setAreasForm((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]))
  }

  const criarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setSucesso('')
    setCriando(true)
    try {
      if (!email || !senha || !nome || areasForm.length === 0) {
        throw new Error('Preencha todos os campos e escolha ao menos uma área.')
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
      setSucesso('Usuário criado com sucesso.')
      setEmail('')
      setSenha('')
      setNome('')
      setPapel('operador')
      setAreasForm([])
      await buscarPerfis()
      setTimeout(() => setSucesso(''), 4000)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setCriando(false)
    }
  }

  if (carregando) {
    return (
      <div className="carregando-tela">
        <span className="spinner spinner--lg" />
        <p>Carregando…</p>
      </div>
    )
  }

  return (
    <div className="pagina-app">
      <Header contexto="Administração" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className="app-main">
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <h1 className="app-titulo">Usuários</h1>
          <p className="app-subtitulo">Crie acessos e defina papel e áreas de cada pessoa.</p>
        </div>

        <div className="admin-grade">
          {/* Formulário */}
          <form className="card" onSubmit={criarUsuario}>
            <div className="card-head">
              <Icon type="conta" size="md" />
              Novo usuário
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div className="field">
                <label htmlFor="a-email">E-mail</label>
                <input id="a-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@solara.com.br" required />
              </div>
              <div className="field">
                <label htmlFor="a-senha">Senha inicial</label>
                <input id="a-senha" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha temporária" required />
              </div>
              <div className="field">
                <label htmlFor="a-nome">Nome</label>
                <input id="a-nome" type="text" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" required />
              </div>
              <div className="field">
                <label htmlFor="a-papel">Papel</label>
                <div className="select-wrap">
                  <select id="a-papel" className="select" value={papel} onChange={(e) => setPapel(e.target.value)}>
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>{p === 'admin' ? 'Admin' : 'Operador'}</option>
                    ))}
                  </select>
                  <Icon type="chevron-baixo" size="sm" />
                </div>
              </div>
              <div className="field">
                <label>Áreas de acesso</label>
                <div className="checklist">
                  {AREAS.map((area) => (
                    <label key={area} className="ctl">
                      <input type="checkbox" checked={areasForm.includes(area)} onChange={() => alternarArea(area)} />
                      <span style={{ textTransform: 'capitalize' }}>{area}</span>
                    </label>
                  ))}
                </div>
              </div>

              {erro && (
                <div className="aviso aviso--erro">
                  <Icon type="alerta" size="sm" />
                  <span>{erro}</span>
                </div>
              )}
              {sucesso && (
                <div className="aviso aviso--ok">
                  <Icon type="check" size="sm" />
                  <span>{sucesso}</span>
                </div>
              )}
            </div>
            <div className="card-foot">
              <button type="submit" className="btn btn--primary" disabled={criando}>
                {criando ? <span className="spinner" /> : <Icon type="check" size="sm" />}
                {criando ? 'Criando…' : 'Criar usuário'}
              </button>
            </div>
          </form>

          {/* Tabela */}
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Áreas</th>
                </tr>
              </thead>
              <tbody>
                {perfis.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <p className="estado-vazio">Nenhum usuário cadastrado</p>
                    </td>
                  </tr>
                ) : (
                  perfis.map((perfil) => (
                    <tr key={perfil.id}>
                      <td style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{perfil.email}</td>
                      <td>{perfil.nome}</td>
                      <td>
                        <span className={`badge ${perfil.papel === 'admin' ? 'badge--promo' : 'badge--neutral'}`}>
                          {perfil.papel === 'admin' ? 'Admin' : 'Operador'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {perfil.areas.map((a) => (
                            <span key={a} className="badge badge--neutral">{a}</span>
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
      </main>
    </div>
  )
}
