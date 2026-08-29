'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/Icon'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) {
        setErro(error.message)
        return
      }
      router.push('/')
    } catch {
      setErro('Não foi possível entrar. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="pagina-entrar">
      <header className="topo">
        <div className="container">
          <span className="marca">
            <span className="selo" aria-hidden="true">S</span>
            <span>
              Solara OS
              <small>Distribuidora</small>
            </span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="entrar-layout">
        <aside className="entrar-lateral">
          <p className="entrar-kicker">Solara OS</p>
          <h1>A máquina prepara, a pessoa decide.</h1>
          <p className="entrar-pitch">
            Agentes de IA processam pedidos de orçamento e conciliações bancárias.
            Nenhuma resposta sai sem uma pessoa aprovar, e toda execução fica registrada.
          </p>
        </aside>

        <main className="entrar-painel">
          <div className="entrar-caixa">
            <h2>Entrar</h2>
            <p className="app-subtitulo">Use suas credenciais de acesso.</p>

            <form onSubmit={enviar} className="entrar-form">
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@solara.com.br"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="senha">Senha</label>
                <input
                  id="senha"
                  type="password"
                  className="input"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha"
                  required
                />
              </div>

              {erro && (
                <div className="aviso aviso--erro">
                  <Icon type="alerta" size="sm" />
                  <span>{erro}</span>
                </div>
              )}

              <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={carregando}>
                {carregando ? <span className="spinner" /> : <Icon type="raio" size="md" />}
                {carregando ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <p className="entrar-nota">
              Não tem acesso? Peça a um administrador para criar seu usuário.
            </p>
          </div>
        </main>
      </div>

      <footer className="rodape-entrar">
        <div className="container">Solara Distribuidora · Betim, MG</div>
      </footer>
    </div>
  )
}
