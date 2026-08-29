'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Perfil {
  papel: string
  areas: string[]
}

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

      // Buscar perfil
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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Carregando...</div>
      </div>
    )
  }

  const areas = [
    { id: 'vendas', nome: 'Vendas', descricao: 'Processar pedidos de orçamento', ativo: true },
    { id: 'financeiro', nome: 'Financeiro', descricao: 'Conciliar extratos bancários', ativo: true },
    { id: 'rh', nome: 'RH', descricao: 'Em breve', ativo: false },
    { id: 'juridico', nome: 'Jurídico', descricao: 'Em breve', ativo: false },
    { id: 'operacoes', nome: 'Operações', descricao: 'Em breve', ativo: false },
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, color: '#333' }}>Solara OS</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {user?.email}
            </div>
            {perfil?.papel === 'admin' && (
              <a
                href="/admin"
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Admin
              </a>
            )}
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                backgroundColor: '#d32f2f',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        <h2 style={{ marginTop: 0, color: '#333', marginBottom: '30px' }}>Áreas</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {areas.map((area) => {
            const temAcesso = perfil?.areas.includes(area.id)
            const podeAcessar = area.ativo && temAcesso

            return (
              <div
                key={area.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  cursor: podeAcessar ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  opacity: area.ativo ? 1 : 0.6,
                  transform: podeAcessar ? 'translateY(0)' : 'translateY(0)',
                }}
                onClick={() => {
                  if (podeAcessar) {
                    router.push(`/${area.id}`)
                  }
                }}
                onMouseEnter={(e) => {
                  if (podeAcessar) {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                }}
              >
                <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>
                  {area.nome}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  {area.descricao}
                </p>

                {!area.ativo && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '6px 10px',
                      backgroundColor: '#f5f5f5',
                      color: '#999',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'inline-block',
                    }}
                  >
                    Em breve
                  </div>
                )}

                {area.ativo && !temAcesso && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '6px 10px',
                      backgroundColor: '#f5f5f5',
                      color: '#999',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'inline-block',
                    }}
                  >
                    Sem acesso
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
