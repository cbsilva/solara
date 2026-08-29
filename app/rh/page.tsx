'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface Colaborador {
  id_colaborador: string
  nome: string
  email: string
  telefone: string | null
}

interface Faixa {
  id_faixa: string
  id_colaborador: string
  valor: number
  inicio: string | null
  status: string
  justificativa: string | null
  criado_em: string
}

const COLUNAS = ['nova', 'processando', 'aguardando_aprovacao', 'aprovada', 'rejeitada'] as const

const STATUS_META: Record<string, { rotulo: string; ponto: string }> = {
  nova: { rotulo: 'Nova', ponto: 'var(--info)' },
  processando: { rotulo: 'Processando', ponto: 'var(--warning)' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', ponto: 'var(--accent)' },
  aprovada: { rotulo: 'Aprovada', ponto: 'var(--success)' },
  rejeitada: { rotulo: 'Rejeitada', ponto: 'var(--danger)' },
}

const brl = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Máscara de moeda: os dígitos digitados são lidos como centavos e
// reexibidos como "1.234,56". Vazio continua vazio.
const mascaraMoeda = (bruto: string) => {
  const digitos = bruto.replace(/\D/g, '')
  if (!digitos) return ''
  return (parseInt(digitos, 10) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// "1.234,56" -> 1234.56
const moedaParaNumero = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'))

export default function RhPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [aba, setAba] = useState<'colaboradores' | 'faixas' | 'aprovacoes'>('faixas')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const router = useRouter()

  // Formulário: novo colaborador
  const [mostraFormCol, setMostraFormCol] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')

  // Formulário: nova faixa
  const [mostraFormFaixa, setMostraFormFaixa] = useState(false)
  const [faixaColaborador, setFaixaColaborador] = useState('')
  const [faixaValor, setFaixaValor] = useState('')
  const [faixaJustificativa, setFaixaJustificativa] = useState('')

  useEffect(() => {
    const verificar = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({ id: session.user.id, email: session.user.email || '' })

      const { data: perfil } = await supabase.from('perfis').select().eq('id', session.user.id).single()
      if (!perfil?.areas?.includes('rh')) {
        router.push('/')
        return
      }

      await Promise.all([buscarColaboradores(), buscarFaixas()])
      setCarregando(false)
    }
    verificar()

    const supabase = createClient()
    const canal = supabase
      .channel('rh-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faixas_salariais' }, () => buscarFaixas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, () => buscarColaboradores())
      .subscribe()
    return () => { canal.unsubscribe() }
  }, [router])

  const buscarColaboradores = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('colaboradores').select().order('id_colaborador', { ascending: true })
    if (data) setColaboradores(data as Colaborador[])
  }

  const buscarFaixas = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('faixas_salariais').select().order('criado_em', { ascending: false })
    if (data) setFaixas(data as Faixa[])
  }

  const nomePorId = (id: string) => colaboradores.find((c) => c.id_colaborador === id)?.nome || id

  // Salário atual = última faixa aprovada do colaborador
  const salarioAtual = (id: string): number | null => {
    const aprovadas = faixas
      .filter((f) => f.id_colaborador === id && f.status === 'aprovada')
      .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))
    return aprovadas[0] ? Number(aprovadas[0].valor) : null
  }

  const criarColaborador = async () => {
    if (!novoNome.trim() || !novoEmail.trim()) {
      alert('Preencha nome e e-mail')
      return
    }
    const supabase = createClient()
    const { data: ultimo } = await supabase
      .from('colaboradores')
      .select('id_colaborador')
      .order('id_colaborador', { ascending: false })
      .limit(1)

    let proximo = 'COL001'
    if (ultimo && ultimo.length > 0) {
      const n = parseInt(ultimo[0].id_colaborador.replace('COL', ''))
      proximo = `COL${String(n + 1).padStart(3, '0')}`
    }

    const { error } = await supabase.from('colaboradores').insert({
      id_colaborador: proximo,
      nome: novoNome,
      email: novoEmail,
      telefone: novoTelefone || null,
    })
    if (!error) {
      setNovoNome('')
      setNovoEmail('')
      setNovoTelefone('')
      setMostraFormCol(false)
      await buscarColaboradores()
    }
  }

  const criarFaixa = async () => {
    const valor = moedaParaNumero(faixaValor)
    if (!faixaColaborador || !valor || valor <= 0) {
      alert('Escolha o colaborador e informe um valor pretendido válido')
      return
    }
    const supabase = createClient()
    const { data: ultima } = await supabase
      .from('faixas_salariais')
      .select('id_faixa')
      .order('id_faixa', { ascending: false })
      .limit(1)

    let proximo = 'FX001'
    if (ultima && ultima.length > 0) {
      const n = parseInt(ultima[0].id_faixa.replace('FX', ''))
      proximo = `FX${String(n + 1).padStart(3, '0')}`
    }

    const { error } = await supabase.from('faixas_salariais').insert({
      id_faixa: proximo,
      id_colaborador: faixaColaborador,
      valor,
      inicio: null,
      status: 'nova',
      justificativa: faixaJustificativa || null,
    })
    if (!error) {
      setFaixaColaborador('')
      setFaixaValor('')
      setFaixaJustificativa('')
      setMostraFormFaixa(false)
      await buscarFaixas()
    }
  }

  const processar = async (id_faixa: string) => {
    setProcessando(id_faixa)
    try {
      const res = await fetch('/api/rh/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_faixa }),
      })
      if (!res.ok) throw new Error('Erro ao processar faixa')
      await buscarFaixas()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setProcessando(null)
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

  const porStatus = COLUNAS.reduce((acc, s) => {
    acc[s] = faixas.filter((f) => f.status === s)
    return acc
  }, {} as Record<string, Faixa[]>)

  const faixaSel = selecionada ? faixas.find((f) => f.id_faixa === selecionada) : null

  return (
    <div className="pagina-app">
      <Header contexto="Recursos Humanos" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className="app-main">
        <div className="tela-cabecalho">
          <div>
            <h1 className="app-titulo">Recursos Humanos</h1>
            <p className="app-subtitulo">Cadastro de colaboradores e aprovação de faixas salariais.</p>
          </div>
          {aba === 'colaboradores' && (
            <button type="button" className="btn btn--primary" onClick={() => setMostraFormCol((v) => !v)}>
              <Icon type="mais" size="sm" />
              Novo colaborador
            </button>
          )}
          {aba === 'faixas' && (
            <button type="button" className="btn btn--primary" onClick={() => setMostraFormFaixa((v) => !v)}>
              <Icon type="mais" size="sm" />
              Nova faixa
            </button>
          )}
        </div>

        {/* Abas */}
        <div className="tabs" style={{ marginBottom: 'var(--sp-5)' }}>
          <button className={`tab ${aba === 'faixas' ? 'is-ativo' : ''}`} onClick={() => setAba('faixas')}>
            <Icon type="painel" size="sm" />
            Faixas salariais
          </button>
          <button className={`tab ${aba === 'colaboradores' ? 'is-ativo' : ''}`} onClick={() => setAba('colaboradores')}>
            <Icon type="usuarios" size="sm" />
            Colaboradores
          </button>
          <button className={`tab ${aba === 'aprovacoes' ? 'is-ativo' : ''}`} onClick={() => setAba('aprovacoes')}>
            <Icon type="check-duplo" size="sm" />
            Aprovações
          </button>
        </div>

        {/* ---- Colaboradores ---- */}
        {aba === 'colaboradores' && (
          <>
            {mostraFormCol && (
              <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="card-head">Novo colaborador</div>
                <div className="card-body">
                  <div className="form-grade">
                    <div className="field">
                      <label htmlFor="col-nome">Nome</label>
                      <input id="col-nome" className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo" />
                    </div>
                    <div className="field">
                      <label htmlFor="col-email">E-mail</label>
                      <input id="col-email" type="email" className="input" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="pessoa@solara.com.br" />
                    </div>
                    <div className="field">
                      <label htmlFor="col-tel">Telefone</label>
                      <input id="col-tel" className="input" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} placeholder="(31) 90000-0000" />
                    </div>
                  </div>
                </div>
                <div className="card-foot">
                  <button type="button" className="btn btn--secondary" onClick={() => setMostraFormCol(false)}>Cancelar</button>
                  <button type="button" className="btn btn--primary" onClick={criarColaborador}>
                    <Icon type="check" size="sm" />
                    Cadastrar
                  </button>
                </div>
              </div>
            )}

            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th className="num">Salário atual</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.length === 0 ? (
                    <tr><td colSpan={5}><p className="estado-vazio">Nenhum colaborador</p></td></tr>
                  ) : (
                    colaboradores.map((c) => (
                      <tr key={c.id_colaborador}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{c.id_colaborador}</td>
                        <td style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{c.nome}</td>
                        <td>{c.email}</td>
                        <td>{c.telefone || '—'}</td>
                        <td className="num">{brl(salarioAtual(c.id_colaborador))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ---- Faixas salariais ---- */}
        {aba === 'faixas' && (
          <>
            {mostraFormFaixa && (
              <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="card-head">Nova faixa salarial</div>
                <div className="card-body">
                  <div className="form-grade">
                    <div className="field">
                      <label htmlFor="fx-col">Colaborador</label>
                      <div className="select-wrap">
                        <select id="fx-col" className="select" value={faixaColaborador} onChange={(e) => setFaixaColaborador(e.target.value)}>
                          <option value="">Selecione…</option>
                          {colaboradores.map((c) => (
                            <option key={c.id_colaborador} value={c.id_colaborador}>{c.nome}</option>
                          ))}
                        </select>
                        <Icon type="chevron-baixo" size="sm" />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="fx-valor">Valor pretendido (R$)</label>
                      <input
                        id="fx-valor"
                        className="input"
                        value={faixaValor}
                        onChange={(e) => setFaixaValor(mascaraMoeda(e.target.value))}
                        placeholder="0,00"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="field field--larga">
                      <label htmlFor="fx-just">Justificativa</label>
                      <textarea id="fx-just" className="input" value={faixaJustificativa} onChange={(e) => setFaixaJustificativa(e.target.value)} placeholder="Motivo da alteração de salário…" />
                    </div>
                  </div>
                </div>
                <div className="card-foot">
                  <button type="button" className="btn btn--secondary" onClick={() => setMostraFormFaixa(false)}>Cancelar</button>
                  <button type="button" className="btn btn--primary" onClick={criarFaixa}>
                    <Icon type="check" size="sm" />
                    Criar faixa
                  </button>
                </div>
              </div>
            )}

            {selecionada && (
              <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="card-head">
                  <Icon type="assistente" size="md" />
                  Execução · {selecionada}
                </div>
                <div className="card-body">
                  <Organograma area="rh" item_id={selecionada} />
                </div>
              </div>
            )}

            <div className="kanban">
              {COLUNAS.map((status) => (
                <div key={status} className="coluna">
                  <div className="coluna-head">
                    <span className="ponto" style={{ background: STATUS_META[status].ponto }} />
                    {STATUS_META[status].rotulo}
                    <span className="conta">{porStatus[status].length}</span>
                  </div>

                  {porStatus[status].map((f) => (
                    <button
                      key={f.id_faixa}
                      type="button"
                      className={`cartao ${selecionada === f.id_faixa ? 'is-selected' : ''}`}
                      onClick={() => setSelecionada(f.id_faixa)}
                    >
                      <div className="cartao-codigo">{f.id_faixa}</div>
                      <div className="cartao-linha">{nomePorId(f.id_colaborador)}</div>
                      <div className="cartao-linha">
                        Pretendido {brl(Number(f.valor))} · atual {brl(salarioAtual(f.id_colaborador))}
                      </div>
                      {f.justificativa && <div className="cartao-msg">{f.justificativa}</div>}

                      {status === 'nova' && (
                        <button
                          type="button"
                          className="btn btn--primary btn--sm btn--block"
                          style={{ marginTop: 'var(--sp-3)' }}
                          disabled={processando === f.id_faixa}
                          onClick={(e) => {
                            e.stopPropagation()
                            processar(f.id_faixa)
                          }}
                        >
                          {processando === f.id_faixa ? <span className="spinner" /> : <Icon type="raio" size="sm" />}
                          {processando === f.id_faixa ? 'Processando…' : 'Processar'}
                        </button>
                      )}
                    </button>
                  ))}

                  {porStatus[status].length === 0 && (
                    <p className="estado-vazio" style={{ padding: 'var(--sp-6) 0' }}>Nenhuma faixa</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Aprovações ---- */}
        {aba === 'aprovacoes' && (
          <div className="card" style={{ height: 620, overflow: 'hidden' }}>
            {user && <FilaAprovacao area="rh" usuarioId={user.id} />}
          </div>
        )}
      </main>

      {/* Painel lateral */}
      {faixaSel && (
        <>
          <div className="drawer-scrim" onClick={() => setSelecionada(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <h3 style={{ fontFamily: 'var(--font-mono)' }}>{faixaSel.id_faixa}</h3>
                <p className="app-subtitulo">{nomePorId(faixaSel.id_colaborador)}</p>
              </div>
              <button type="button" className="icone-btn" onClick={() => setSelecionada(null)} aria-label="Fechar">
                <Icon type="fechar" size="md" />
              </button>
            </div>
            <LinhaDoTempo item_id={faixaSel.id_faixa} />
          </aside>
        </>
      )}
    </div>
  )
}
