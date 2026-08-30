'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface Usuario {
  id: string
  email: string
  usar_agente: boolean
}

export default function AdminUsuariosPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const verificar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({ id: session.user.id, email: session.user.email || '' })

      // Buscar todos os usuários com seus perfis
      const { data: usuariosData } = await supabase
        .from('auth.users')
        .select(`
          id,
          email,
          perfis_usuario(usar_agente)
        `)

      if (usuariosData) {
        const usuariosFormatados = usuariosData.map((u: any) => ({
          id: u.id,
          email: u.email,
          usar_agente: u.perfis_usuario?.[0]?.usar_agente || false,
        }))
        setUsuarios(usuariosFormatados)
      }

      setCarregando(false)
    }

    verificar()
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
        texto: `Permissão ${novoValor ? 'ativada' : 'desativada'} para ${usuarios.find(u => u.id === usuarioId)?.email}`
      })
    } catch (err) {
      setMensagem({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao atualizar permissão'
      })
    } finally {
      setSalvando(null)
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
      <Header contexto="Admin · Usuários" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className="app-main">
        <div className="tela-cabecalho">
          <div>
            <h1 className="app-titulo">Permissões de Agentes</h1>
            <p className="app-subtitulo">Controle quem pode usar os agentes de IA.</p>
          </div>
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
                  <th style={{ textAlign: 'center', padding: 'var(--sp-3)', fontWeight: 600 }}>Usar Agentes</th>
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
                        {salvando === u.id ? (
                          <>
                            <span className="spinner" style={{ marginRight: '0.5rem' }} />
                            Salvando…
                          </>
                        ) : (
                          u.usar_agente ? 'Desativar' : 'Ativar'
                        )}
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
      </main>
    </div>
  )
}
