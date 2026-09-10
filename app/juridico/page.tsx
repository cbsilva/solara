'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface Analise {
  id_analise: string
  contraparte: string
  tipo_contrato: string
  texto_minuta: string
  valor_envolvido: number | null
  risco_geral: string | null
  status: string
  criado_em: string
}

interface ClausulaAnalisada {
  id: string
  id_analise: string
  tema: string
  texto_clausula: string | null
  classificacao_risco: string | null
  analise: Record<string, any> | null
  status: string
}

interface ClausulaPadrao {
  tema: string
  posicao_padrao: string
  limite: Record<string, any> | null
  clausula_vetada: boolean
  fundamento: string | null
}

const COLUNAS = ['nova', 'processando', 'aguardando_aprovacao', 'aprovada', 'rejeitada'] as const

const STATUS_META: Record<string, { rotulo: string; ponto: string }> = {
  nova: { rotulo: 'Nova', ponto: 'var(--info)' },
  processando: { rotulo: 'Processando', ponto: 'var(--warning)' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', ponto: 'var(--accent)' },
  aprovada: { rotulo: 'Aprovada', ponto: 'var(--success)' },
  rejeitada: { rotulo: 'Rejeitada', ponto: 'var(--danger)' },
}

const TIPOS_CONTRATO = [
  'fornecimento',
  'cliente',
  'representacao_comercial',
  'locacao',
  'prestacao_servicos',
  'transporte',
  'nda',
  'outro',
]

const RISCO_GRUPO: { chave: string; rotulo: string; classe: string }[] = [
  { chave: 'alinhada', rotulo: 'Alinhadas', classe: 'badge--success' },
  { chave: 'ajuste', rotulo: 'Ajuste sugerido', classe: 'badge--warning' },
  { chave: 'inaceitavel', rotulo: 'Inaceitáveis', classe: 'badge--danger' },
]

const MAX_MINUTA = 60000

const brl = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mascaraMoeda = (bruto: string) => {
  const digitos = bruto.replace(/\D/g, '')
  if (!digitos) return ''
  return (parseInt(digitos, 10) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
const moedaParaNumero = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'))

export default function JuridicoPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [analises, setAnalises] = useState<Analise[]>([])
  const [clausulas, setClausulas] = useState<ClausulaAnalisada[]>([])
  const [padrao, setPadrao] = useState<ClausulaPadrao[]>([])
  const [aba, setAba] = useState<'analises' | 'padrao' | 'aprovacoes'>('analises')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const router = useRouter()

  const [mostraForm, setMostraForm] = useState(false)
  const [fContraparte, setFContraparte] = useState('')
  const [fTipo, setFTipo] = useState('fornecimento')
  const [fValor, setFValor] = useState('')
  const [fMinuta, setFMinuta] = useState('')

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
      if (!perfil?.areas?.includes('juridico')) {
        router.push('/')
        return
      }

      await Promise.all([buscarAnalises(), buscarClausulas(), buscarPadrao()])
      setCarregando(false)
    }
    verificar()

    const supabase = createClient()
    const canal = supabase
      .channel('juridico-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analises_juridicas' }, () => buscarAnalises())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clausulas_analisadas' }, () => buscarClausulas())
      .subscribe()
    return () => { canal.unsubscribe() }
  }, [router])

  const buscarAnalises = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('analises_juridicas').select().order('criado_em', { ascending: false })
    if (data) setAnalises(data as Analise[])
  }

  const buscarClausulas = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('clausulas_analisadas').select().order('criado_em', { ascending: true })
    if (data) setClausulas(data as ClausulaAnalisada[])
  }

  const buscarPadrao = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('clausulas_padrao').select().order('tema', { ascending: true })
    if (data) setPadrao(data as ClausulaPadrao[])
  }

  const criarAnalise = async () => {
    if (!fContraparte.trim() || !fMinuta.trim()) {
      alert('Preencha a contraparte e cole o texto da minuta.')
      return
    }
    if (fMinuta.length > MAX_MINUTA) {
      alert(`A minuta tem ${fMinuta.length} caracteres. O limite é ${MAX_MINUTA}.`)
      return
    }
    const supabase = createClient()
    const { data: ultima } = await supabase
      .from('analises_juridicas')
      .select('id_analise')
      .order('id_analise', { ascending: false })
      .limit(1)

    let proximo = 'AJ001'
    if (ultima && ultima.length > 0) {
      const n = parseInt(ultima[0].id_analise.replace('AJ', ''))
      proximo = `AJ${String(n + 1).padStart(3, '0')}`
    }

    const valor = fValor ? moedaParaNumero(fValor) : null
    const { error } = await supabase.from('analises_juridicas').insert({
      id_analise: proximo,
      contraparte: fContraparte.trim(),
      tipo_contrato: fTipo,
      texto_minuta: fMinuta,
      valor_envolvido: valor && !isNaN(valor) ? valor : null,
      status: 'nova',
    })
    if (!error) {
      setFContraparte('')
      setFTipo('fornecimento')
      setFValor('')
      setFMinuta('')
      setMostraForm(false)
      await buscarAnalises()
    }
  }

  const processar = async (id_analise: string) => {
    setProcessando(id_analise)
    try {
      const res = await fetch('/api/juridico/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_analise }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.erro || 'Erro ao processar análise')
      }
      await buscarAnalises()
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
    acc[s] = analises.filter((a) => a.status === s)
    return acc
  }, {} as Record<string, Analise[]>)

  const analiseSel = selecionada ? analises.find((a) => a.id_analise === selecionada) : null
  const clausulasSel = selecionada ? clausulas.filter((c) => c.id_analise === selecionada) : []

  return (
    <div className="pagina-app">
      <Header contexto="Jurídico" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className={`app-main ${analiseSel ? 'app-main--com-detalhe' : ''}`}>
      <div className="app-main-conteudo">
        <div className="tela-cabecalho">
          <div>
            <h1 className="app-titulo">Jurídico</h1>
            <p className="app-subtitulo">Análise de minutas de contrato contra as posições-padrão da Solara.</p>
          </div>
          {aba === 'analises' && (
            <button type="button" className="btn btn--primary" onClick={() => setMostraForm((v) => !v)}>
              <Icon type="mais" size="sm" />
              Nova análise
            </button>
          )}
        </div>

        <div className="tabs" style={{ marginBottom: 'var(--sp-5)' }}>
          <button className={`tab ${aba === 'analises' ? 'is-ativo' : ''}`} onClick={() => setAba('analises')}>
            <Icon type="painel" size="sm" />
            Análises
          </button>
          <button className={`tab ${aba === 'padrao' ? 'is-ativo' : ''}`} onClick={() => setAba('padrao')}>
            <Icon type="cotacoes" size="sm" />
            Cláusulas-padrão
          </button>
          <button className={`tab ${aba === 'aprovacoes' ? 'is-ativo' : ''}`} onClick={() => setAba('aprovacoes')}>
            <Icon type="check-duplo" size="sm" />
            Aprovações
          </button>
        </div>

        {/* ---- Análises ---- */}
        {aba === 'analises' && (
          <>
            {mostraForm && (
              <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="card-head">Nova análise de contrato</div>
                <div className="card-body">
                  <div className="form-grade">
                    <div className="field">
                      <label htmlFor="j-contraparte">Contraparte</label>
                      <input id="j-contraparte" className="input" value={fContraparte} onChange={(e) => setFContraparte(e.target.value)} placeholder="Nome da outra parte" />
                    </div>
                    <div className="field">
                      <label htmlFor="j-tipo">Tipo de contrato</label>
                      <div className="select-wrap">
                        <select id="j-tipo" className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                          {TIPOS_CONTRATO.map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                        <Icon type="chevron-baixo" size="sm" />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="j-valor">Valor envolvido (R$) — opcional</label>
                      <input
                        id="j-valor"
                        className="input"
                        value={fValor}
                        onChange={(e) => setFValor(mascaraMoeda(e.target.value))}
                        placeholder="0,00"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="field field--larga">
                      <label htmlFor="j-minuta">Texto da minuta</label>
                      <textarea
                        id="j-minuta"
                        className="input"
                        style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}
                        value={fMinuta}
                        onChange={(e) => setFMinuta(e.target.value)}
                        placeholder="Cole aqui o texto completo do contrato…"
                      />
                      <span className="rotulo-mini" style={{ color: fMinuta.length > MAX_MINUTA ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {fMinuta.length} / {MAX_MINUTA} caracteres
                      </span>
                    </div>
                  </div>
                </div>
                <div className="card-foot">
                  <button type="button" className="btn btn--secondary" onClick={() => setMostraForm(false)}>Cancelar</button>
                  <button type="button" className="btn btn--primary" onClick={criarAnalise}>
                    <Icon type="check" size="sm" />
                    Criar análise
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
                  <Organograma area="juridico" item_id={selecionada} />

                  {clausulasSel.length > 0 && (
                    <div style={{ marginTop: 'var(--sp-5)' }}>
                      {RISCO_GRUPO.map((g) => {
                        const doGrupo = clausulasSel.filter((c) => c.classificacao_risco === g.chave)
                        if (doGrupo.length === 0) return null
                        return (
                          <div key={g.chave} style={{ marginBottom: 'var(--sp-4)' }}>
                            <div className="rotulo-mini" style={{ marginBottom: 'var(--sp-2)' }}>
                              <span className={`badge ${g.classe}`}>{g.rotulo}</span> {doGrupo.length}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                              {doGrupo.map((c) => (
                                <div key={c.id} className="card" style={{ padding: 'var(--sp-3)' }}>
                                  <div className="rotulo-mini">{c.tema}{c.texto_clausula == null ? ' · ausente na minuta' : ''}</div>
                                  {c.analise?.problema && <div style={{ marginTop: 4 }}>{c.analise.problema}</div>}
                                  {c.analise?.sugestao_redacao && (
                                    <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                                      <strong>Sugestão:</strong> {c.analise.sugestao_redacao}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
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

                  {porStatus[status].map((a) => (
                    <button
                      key={a.id_analise}
                      type="button"
                      className={`cartao ${selecionada === a.id_analise ? 'is-selected' : ''}`}
                      onClick={() => setSelecionada(a.id_analise)}
                    >
                      <div className="cartao-codigo">{a.id_analise}</div>
                      <div className="cartao-linha">{a.contraparte}</div>
                      <div className="cartao-linha">
                        {a.tipo_contrato.replace(/_/g, ' ')} · {brl(a.valor_envolvido)}
                        {a.risco_geral ? ` · risco ${a.risco_geral}` : ''}
                      </div>
                      {a.texto_minuta && <div className="cartao-msg">{a.texto_minuta.slice(0, 80)}</div>}

                      {status === 'nova' && (
                        <button
                          type="button"
                          className="btn btn--primary btn--sm btn--block"
                          style={{ marginTop: 'var(--sp-3)' }}
                          disabled={processando === a.id_analise}
                          onClick={(e) => {
                            e.stopPropagation()
                            processar(a.id_analise)
                          }}
                        >
                          {processando === a.id_analise ? <span className="spinner" /> : <Icon type="raio" size="sm" />}
                          {processando === a.id_analise ? 'Processando…' : 'Processar'}
                        </button>
                      )}
                    </button>
                  ))}

                  {porStatus[status].length === 0 && (
                    <p className="estado-vazio" style={{ padding: 'var(--sp-6) 0' }}>Nenhuma análise</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Cláusulas-padrão ---- */}
        {aba === 'padrao' && (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tema</th>
                  <th>Posição-padrão da Solara</th>
                  <th>Limite</th>
                  <th>Vetada</th>
                  <th>Fundamento</th>
                </tr>
              </thead>
              <tbody>
                {padrao.length === 0 ? (
                  <tr><td colSpan={5}><p className="estado-vazio">Nenhuma cláusula-padrão cadastrada</p></td></tr>
                ) : (
                  padrao.map((c) => (
                    <tr key={c.tema}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{c.tema}</td>
                      <td>{c.posicao_padrao}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}>
                        {c.limite ? JSON.stringify(c.limite) : '—'}
                      </td>
                      <td>{c.clausula_vetada ? <span className="badge badge--danger">vetada</span> : '—'}</td>
                      <td style={{ fontSize: 'var(--fs-xs)' }}>{c.fundamento || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Aprovações ---- */}
        {aba === 'aprovacoes' && (
          <div className="card" style={{ height: 620, overflow: 'hidden' }}>
            {user && <FilaAprovacao area="juridico" usuarioId={user.id} />}
          </div>
        )}
      </div>

        {analiseSel && (
          <aside className="app-main-detalhe">
            <div className="drawer-head">
              <div>
                <h3 style={{ fontFamily: 'var(--font-mono)' }}>{analiseSel.id_analise}</h3>
                <p className="app-subtitulo">{analiseSel.contraparte}</p>
              </div>
              <button type="button" className="icone-btn" onClick={() => setSelecionada(null)} aria-label="Fechar">
                <Icon type="fechar" size="md" />
              </button>
            </div>
            <LinhaDoTempo item_id={analiseSel.id_analise} />
          </aside>
        )}
      </main>
    </div>
  )
}
