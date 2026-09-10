'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface Ciclo {
  id_ciclo: string
  disparado_em: string
  total_rupturas: number | null
  status: string
}

interface Ruptura {
  id: string
  id_ciclo: string
  cod_produto: string
  estoque_atual: number | null
  ponto_reposicao: number | null
  cobertura_dias: number | null
  analise: Record<string, any> | null
  status: string
}

interface Fornecedor {
  cod_fornecedor: string
  nome: string
  prazo_entrega_dias: number | null
  pedido_minimo_valor: number | null
  homologado: boolean
  observacao: string | null
}

interface Parametro {
  cod_produto: string
  ponto_reposicao: number | null
  estoque_maximo: number | null
  consumo_medio_mensal: number | null
  cod_fornecedor_preferencial: string | null
}

const COLUNAS = ['novo', 'investigando', 'aguardando_aprovacao', 'resolvido'] as const

const STATUS_META: Record<string, { rotulo: string; ponto: string }> = {
  novo: { rotulo: 'Nova', ponto: 'var(--info)' },
  investigando: { rotulo: 'Investigando', ponto: 'var(--warning)' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', ponto: 'var(--accent)' },
  resolvido: { rotulo: 'Resolvida', ponto: 'var(--success)' },
}

const brl = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function OperacoesPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [rupturas, setRupturas] = useState<Ruptura[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [parametros, setParametros] = useState<Parametro[]>([])
  const [produtos, setProdutos] = useState<Record<string, string>>({})
  const [relatorio, setRelatorio] = useState<string>('')
  const [aba, setAba] = useState<'rupturas' | 'relatorio' | 'aprovacoes' | 'fornecedores' | 'parametros'>('rupturas')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [planejando, setPlanejando] = useState(false)
  const router = useRouter()

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
      if (!perfil?.areas?.includes('operacoes')) {
        router.push('/')
        return
      }

      await Promise.all([buscarCiclos(), buscarRupturas(), buscarFornecedores(), buscarParametros(), buscarProdutos()])
      setCarregando(false)
    }
    verificar()

    const supabase = createClient()
    const canal = supabase
      .channel('operacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ciclos_reposicao' }, () => buscarCiclos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_ruptura' }, () => buscarRupturas())
      .subscribe()
    return () => { canal.unsubscribe() }
  }, [router])

  const buscarCiclos = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('ciclos_reposicao').select().order('id_ciclo', { ascending: false })
    if (data) {
      setCiclos(data as Ciclo[])
      setSelecionado((atual) => atual || (data[0]?.id_ciclo ?? null))
    }
  }

  const buscarRupturas = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('itens_ruptura').select().order('cod_produto', { ascending: true })
    if (data) setRupturas(data as Ruptura[])
  }

  const buscarFornecedores = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('fornecedores').select().order('cod_fornecedor', { ascending: true })
    if (data) setFornecedores(data as Fornecedor[])
  }

  const buscarParametros = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('parametros_estoque').select().order('cod_produto', { ascending: true })
    if (data) setParametros(data as Parametro[])
  }

  const buscarProdutos = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('produtos').select('cod_produto, descricao')
    if (data) {
      const mapa: Record<string, string> = {}
      for (const p of data as any[]) mapa[p.cod_produto] = p.descricao
      setProdutos(mapa)
    }
  }

  useEffect(() => {
    const buscarRelatorio = async () => {
      if (!selecionado) { setRelatorio(''); return }
      const supabase = createClient()
      const { data } = await supabase
        .from('aprovacoes')
        .select('proposta')
        .eq('area', 'operacoes')
        .eq('item_id', selecionado)
        .order('created_at', { ascending: true })
        .limit(1)
      setRelatorio((data?.[0]?.proposta as any)?.relatorio || '')
    }
    buscarRelatorio()
  }, [selecionado, rupturas])

  const planejar = async () => {
    setPlanejando(true)
    try {
      const res = await fetch('/api/operacoes/planejar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.erro || 'Erro ao planejar reposição')
      if (data.id_ciclo) setSelecionado(data.id_ciclo)
      if (data.rupturas === 0) alert('Nenhum produto abaixo do ponto de reposição. Ciclo concluído sem ordens.')
      await Promise.all([buscarCiclos(), buscarRupturas()])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setPlanejando(false)
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

  const rupturasCiclo = selecionado ? rupturas.filter((r) => r.id_ciclo === selecionado) : []
  const porStatus = COLUNAS.reduce((acc, s) => {
    acc[s] = rupturasCiclo.filter((r) => r.status === s)
    return acc
  }, {} as Record<string, Ruptura[]>)
  const cicloSel = selecionado ? ciclos.find((c) => c.id_ciclo === selecionado) : null

  return (
    <div className="pagina-app">
      <Header contexto="Operações" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className={`app-main ${cicloSel ? 'app-main--com-detalhe' : ''}`}>
      <div className="app-main-conteudo">
        <div className="tela-cabecalho">
          <div>
            <h1 className="app-titulo">Operações</h1>
            <p className="app-subtitulo">Planejamento de reposição de estoque e ordens de compra.</p>
          </div>
          <button type="button" className="btn btn--primary" disabled={planejando} onClick={planejar}>
            {planejando ? <span className="spinner" /> : <Icon type="raio" size="sm" />}
            {planejando ? 'Planejando…' : 'Planejar reposição'}
          </button>
        </div>

        {ciclos.length > 0 && (
          <div className="tabs" style={{ marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {ciclos.map((c) => (
              <button
                key={c.id_ciclo}
                className={`tab ${selecionado === c.id_ciclo ? 'is-ativo' : ''}`}
                onClick={() => setSelecionado(c.id_ciclo)}
              >
                {c.id_ciclo} · {c.total_rupturas ?? 0} rupturas · {c.status}
              </button>
            ))}
          </div>
        )}

        <div className="tabs" style={{ marginBottom: 'var(--sp-5)' }}>
          <button className={`tab ${aba === 'rupturas' ? 'is-ativo' : ''}`} onClick={() => setAba('rupturas')}>
            <Icon type="painel" size="sm" />
            Rupturas
          </button>
          <button className={`tab ${aba === 'relatorio' ? 'is-ativo' : ''}`} onClick={() => setAba('relatorio')}>
            <Icon type="cotacoes" size="sm" />
            Relatório
          </button>
          <button className={`tab ${aba === 'aprovacoes' ? 'is-ativo' : ''}`} onClick={() => setAba('aprovacoes')}>
            <Icon type="check-duplo" size="sm" />
            Aprovações
          </button>
          <button className={`tab ${aba === 'fornecedores' ? 'is-ativo' : ''}`} onClick={() => setAba('fornecedores')}>
            <Icon type="usuarios" size="sm" />
            Fornecedores
          </button>
          <button className={`tab ${aba === 'parametros' ? 'is-ativo' : ''}`} onClick={() => setAba('parametros')}>
            <Icon type="config" size="sm" />
            Parâmetros
          </button>
        </div>

        {/* ---- Rupturas ---- */}
        {aba === 'rupturas' && (
          <>
            {selecionado && (
              <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="card-head">
                  <Icon type="assistente" size="md" />
                  Execução · {selecionado}
                </div>
                <div className="card-body">
                  <Organograma area="operacoes" item_id={selecionado} />
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

                  {porStatus[status].map((r) => (
                    <div key={r.id} className="cartao">
                      <div className="cartao-codigo">{r.cod_produto}</div>
                      <div className="cartao-linha">{produtos[r.cod_produto] || '—'}</div>
                      <div className="cartao-linha">
                        estoque {r.estoque_atual ?? '—'} / ponto {r.ponto_reposicao ?? '—'}
                        {r.cobertura_dias != null ? ` · cobre ${r.cobertura_dias}d` : ''}
                      </div>
                      {r.analise?.quantidade_sugerida != null && (
                        <div className="cartao-msg">
                          Sugerido: {r.analise.quantidade_sugerida} un · {brl(r.analise.custo_estimado)} · {r.analise.urgencia || '—'}
                        </div>
                      )}
                    </div>
                  ))}

                  {porStatus[status].length === 0 && (
                    <p className="estado-vazio" style={{ padding: 'var(--sp-6) 0' }}>Nenhuma ruptura</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- Relatório ---- */}
        {aba === 'relatorio' && (
          <div className="card">
            <div className="card-body">
              {relatorio ? (
                <pre className="preview" style={{ whiteSpace: 'pre-wrap' }}>{relatorio}</pre>
              ) : (
                <p className="estado-vazio">Sem relatório para este ciclo ainda.</p>
              )}
            </div>
          </div>
        )}

        {/* ---- Aprovações ---- */}
        {aba === 'aprovacoes' && (
          <div className="card" style={{ height: 620, overflow: 'hidden' }}>
            {user && <FilaAprovacao area="operacoes" usuarioId={user.id} />}
          </div>
        )}

        {/* ---- Fornecedores ---- */}
        {aba === 'fornecedores' && (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Cód.</th>
                  <th>Nome</th>
                  <th className="num">Prazo (dias)</th>
                  <th className="num">Pedido mínimo</th>
                  <th>Homologado</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.length === 0 ? (
                  <tr><td colSpan={5}><p className="estado-vazio">Nenhum fornecedor cadastrado</p></td></tr>
                ) : (
                  fornecedores.map((f) => (
                    <tr key={f.cod_fornecedor}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{f.cod_fornecedor}</td>
                      <td style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{f.nome}</td>
                      <td className="num">{f.prazo_entrega_dias ?? '—'}</td>
                      <td className="num">{brl(f.pedido_minimo_valor)}</td>
                      <td>{f.homologado ? <span className="badge badge--success">sim</span> : <span className="badge badge--danger">não</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Parâmetros ---- */}
        {aba === 'parametros' && (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Descrição</th>
                  <th className="num">Ponto de reposição</th>
                  <th className="num">Estoque máximo</th>
                  <th className="num">Consumo médio/mês</th>
                  <th>Fornecedor pref.</th>
                </tr>
              </thead>
              <tbody>
                {parametros.length === 0 ? (
                  <tr><td colSpan={6}><p className="estado-vazio">Nenhum parâmetro cadastrado</p></td></tr>
                ) : (
                  parametros.map((p) => (
                    <tr key={p.cod_produto}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{p.cod_produto}</td>
                      <td>{produtos[p.cod_produto] || '—'}</td>
                      <td className="num">{p.ponto_reposicao ?? '—'}</td>
                      <td className="num">{p.estoque_maximo ?? '—'}</td>
                      <td className="num">{p.consumo_medio_mensal ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{p.cod_fornecedor_preferencial || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

        {cicloSel && (
          <aside className="app-main-detalhe">
            <div className="drawer-head">
              <div>
                <h3 style={{ fontFamily: 'var(--font-mono)' }}>{cicloSel.id_ciclo}</h3>
                <p className="app-subtitulo">{cicloSel.total_rupturas ?? 0} rupturas · {cicloSel.status}</p>
              </div>
              <button type="button" className="icone-btn" onClick={() => setSelecionado(null)} aria-label="Fechar">
                <Icon type="fechar" size="md" />
              </button>
            </div>
            <LinhaDoTempo item_id={cicloSel.id_ciclo} />
          </aside>
        )}
      </main>
    </div>
  )
}
