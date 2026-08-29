'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { Icon, IconType } from '@/components/Icon'

interface Perfil {
  papel: string
  areas: string[]
}

const AREAS: {
  id: string
  nome: string
  descricao: string
  icone: IconType
  ativo: boolean
}[] = [
  { id: 'vendas', nome: 'Vendas', descricao: 'Processar pedidos de orçamento com triagem, pesquisa e redação.', icone: 'pedidos', ativo: true },
  { id: 'financeiro', nome: 'Financeiro', descricao: 'Conciliar extratos bancários e investigar divergências.', icone: 'cotacoes', ativo: true },
  { id: 'rh', nome: 'RH', descricao: 'Cadastro de colaboradores e aprovação de faixas salariais.', icone: 'usuarios', ativo: true },
  { id: 'juridico', nome: 'Jurídico', descricao: 'Em breve.', icone: 'cotacoes', ativo: false },
  { id: 'operacoes', nome: 'Operações', descricao: 'Em breve.', icone: 'config', ativo: false },
]

export default function HomePage() {
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const verificar = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({ email: session.user.email || '', id: session.user.id })
      const { data } = await supabase.from('perfis').select().eq('id', session.user.id).single()
      if (data) setPerfil(data as Perfil)
      setCarregando(false)
    }
    verificar()
  }, [router])

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
      <Header
        contexto="Menu de áreas"
        usuarioEmail={user?.email}
        mostraAdmin={perfil?.papel === 'admin'}
        mostraLogout
      />

      <main className="app-main">
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <h1 className="app-titulo">Bem-vindo, {user?.email?.split('@')[0]}</h1>
          <p className="app-subtitulo">Selecione uma área para começar.</p>
        </div>

        <div className="areas-grade">
          {AREAS.map((area) => {
            const temAcesso = perfil?.areas?.includes(area.id)
            const podeAcessar = area.ativo && !!temAcesso

            return (
              <button
                key={area.id}
                type="button"
                className="area-card"
                disabled={!podeAcessar}
                onClick={() => podeAcessar && router.push(`/${area.id}`)}
              >
                <span className="icone-caixa">
                  <Icon type={area.icone} size="lg" />
                </span>
                <h3>{area.nome}</h3>
                <p>{area.descricao}</p>

                <div className="area-card-rodape">
                  {!area.ativo && <span className="badge badge--neutral">Em breve</span>}
                  {area.ativo && !temAcesso && <span className="badge badge--neutral">Sem acesso</span>}
                  {podeAcessar && (
                    <span className="avancar">
                      Acessar
                      <Icon type="chevron-dir" size="sm" />
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
