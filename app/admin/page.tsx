'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

const supabase = createClient()

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
  const [aba, setAba] = useState<'usuarios' | 'agentes'>('usuarios')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('operador')
  const [areasForm, setAreasForm] = useState<string[]>([])
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [papelEdit, setPapelEdit] = useState('operador')
  const [areasEdit, setAreasEdit] = useState<string[]>([])
  const [salvandoEdit, setSalvandoEdit] = useState(false)

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

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setSucesso('')
    setSalvandoEdit(true)
    try {
      if (!nomeEdit || !papelEdit || areasEdit.length === 0) {
        throw new Error('Preencha todos os campos.')
      }
      const res = await fetch('/api/admin/editar-usuario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editando, nome: nomeEdit, papel: papelEdit, areas: areasEdit }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.erro || 'Erro ao editar usuário')
      }
      setSucesso('Usuário atualizado com sucesso.')
      setEditando(null)
      await buscarPerfis()
      setTimeout(() => setSucesso(''), 4000)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao editar usuário')
    } finally {
      setSalvandoEdit(false)
    }
  }

  const iniciarEdicao = (perfil: Perfil) => {
    setEditando(perfil.id)
    setNomeEdit(perfil.nome)
    setPapelEdit(perfil.papel)
    setAreasEdit(perfil.areas)
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
        <div style={{ marginBottom: 'var(--sp-6)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-4)' }}>
          <h1 className="app-titulo">Administração</h1>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
            <button
              type="button"
              onClick={() => setAba('usuarios')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderBottom: aba === 'usuarios' ? '2px solid var(--primary)' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: aba === 'usuarios' ? 600 : 400,
                color: aba === 'usuarios' ? 'var(--primary)' : 'var(--text)',
              }}
            >
              Usuários
            </button>
            <button
              type="button"
              onClick={() => setAba('agentes')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderBottom: aba === 'agentes' ? '2px solid var(--primary)' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: aba === 'agentes' ? 600 : 400,
                color: aba === 'agentes' ? 'var(--primary)' : 'var(--text)',
              }}
            >
              Permissões de Agentes
            </button>
          </div>
        </div>

        {aba === 'usuarios' && (
          <>
            <div style={{ marginBottom: 'var(--sp-6)' }}>
              <p className="app-subtitulo">Crie acessos e defina papel e áreas de cada pessoa.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
              {/* Formulários */}
              <div style={{ display: 'flex', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
                <form className="card" onSubmit={criarUsuario} style={{ flex: 1, minWidth: '320px' }}>
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

              {/* Formulário de edição */}
              {editando && (
                <form className="card" onSubmit={salvarEdicao} style={{ flex: 1, minWidth: '320px' }}>
                  <div className="card-head">
                    <Icon type="editar" size="md" />
                    Editar usuário
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                    <div className="field">
                      <label htmlFor="e-nome">Nome</label>
                      <input id="e-nome" type="text" className="input" value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)} placeholder="Nome completo" required />
                    </div>
                    <div className="field">
                      <label htmlFor="e-papel">Papel</label>
                      <div className="select-wrap">
                        <select id="e-papel" className="select" value={papelEdit} onChange={(e) => setPapelEdit(e.target.value)}>
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
                            <input type="checkbox" checked={areasEdit.includes(area)} onChange={() => setAreasEdit((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area])} />
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
                  </div>
                  <div className="card-foot" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                    <button type="submit" className="btn btn--primary" disabled={salvandoEdit}>
                      {salvandoEdit ? <span className="spinner" /> : <Icon type="check" size="sm" />}
                      {salvandoEdit ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button type="button" className="btn" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
              </div>

              {/* Tabela */}
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Nome</th>
                      <th>Papel</th>
                      <th>Áreas</th>
                      <th style={{ textAlign: 'center' }}>Ação</th>
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
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => iniciarEdicao(perfil)}
                              style={{ background: 'var(--info)', color: 'white', border: 'none', cursor: 'pointer' }}
                            >
                              <Icon type="editar" size="sm" />
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {aba === 'agentes' && (
          <AdminAgentes />
        )}
      </main>
    </div>
  )
}

function AdminAgentes() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const buscar = async () => {
      try {
        const res = await fetch('/api/admin/listar-usuarios')
        if (!res.ok) throw new Error('Erro ao buscar usuários')
        const usuarios = await res.json()
        setUsuarios(usuarios)
      } catch (err) {
        console.error(err)
      } finally {
        setCarregando(false)
      }
    }

    buscar()
  }, [])

  const alternarPermissao = async (usuarioId: string, novoValor: boolean) => {
    setSalvando(usuarioId)
    setMensagem(null)

    try {
      const { error } = await supabase
        .from('perfis_usuario')
        .upsert({
          id: usuarioId,
          usar_agente: novoValor,
        })

      if (error) throw error

      setUsuarios(usuarios.map(u =>
        u.id === usuarioId ? { ...u, usar_agente: novoValor } : u
      ))

      setMensagem({
        tipo: 'sucesso',
        texto: `Agentes ${novoValor ? 'ativados' : 'desativados'} para ${usuarios.find(u => u.id === usuarioId)?.email}`
      })
    } catch (err) {
      setMensagem({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao atualizar'
      })
    } finally {
      setSalvando(null)
    }
  }

  if (carregando) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-6)' }}>
        <span className="spinner" />
        <p>Carregando…</p>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <p className="app-subtitulo">Controle quem pode usar os agentes de IA.</p>
      </div>

      {mensagem && (
        <div
          style={{
            padding: 'var(--sp-4)',
            marginBottom: 'var(--sp-4)',
            borderRadius: 'var(--br)',
            background: mensagem.tipo === 'sucesso' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: mensagem.tipo === 'sucesso' ? 'var(--success-text)' : 'var(--danger-text)',
            border: `1px solid ${mensagem.tipo === 'sucesso' ? 'var(--success)' : 'var(--danger)'}`,
          }}
        >
          {mensagem.texto}
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--sp-3)', fontWeight: 600 }}>Email</th>
                <th style={{ textAlign: 'center', padding: 'var(--sp-3)', fontWeight: 600 }}>Agentes</th>
                <th style={{ textAlign: 'center', padding: 'var(--sp-3)', fontWeight: 600 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-3)' }}>{u.email}</td>
                  <td style={{ textAlign: 'center', padding: 'var(--sp-3)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        background: u.usar_agente ? 'var(--success-bg)' : 'var(--warning-bg)',
                        color: u.usar_agente ? 'var(--success-text)' : 'var(--warning-text)',
                      }}
                    >
                      {u.usar_agente ? '✓ Ativo' : '✗ Inativo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', padding: 'var(--sp-3)' }}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => alternarPermissao(u.id, !u.usar_agente)}
                      disabled={salvando === u.id}
                      style={{
                        background: u.usar_agente ? 'var(--danger)' : 'var(--success)',
                        color: 'white',
                        border: 'none',
                        cursor: salvando === u.id ? 'not-allowed' : 'pointer',
                        opacity: salvando === u.id ? 0.6 : 1,
                      }}
                    >
                      {salvando === u.id ? 'Salvando…' : u.usar_agente ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {usuarios.length === 0 && (
            <p style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--text-muted)' }}>
              Nenhum usuário encontrado
            </p>
          )}
        </div>
      </div>
    </>
  )
}
