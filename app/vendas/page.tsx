'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'

interface PedidoOrcamento {
  cod_pedido: string
  cod_cliente: string
  mensagem: string
  canal: string
  data: string
  status: string
}

const COLUNAS = ['novo', 'processando', 'aguardando_aprovacao', 'respondido', 'rejeitado'] as const

const STATUS_META: Record<string, { rotulo: string; ponto: string }> = {
  novo: { rotulo: 'Novo', ponto: 'var(--info)' },
  processando: { rotulo: 'Processando', ponto: 'var(--warning)' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', ponto: 'var(--accent)' },
  respondido: { rotulo: 'Respondido', ponto: 'var(--success)' },
  rejeitado: { rotulo: 'Rejeitado', ponto: 'var(--danger)' },
}

export default function VendasPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pedidos, setPedidos] = useState<PedidoOrcamento[]>([])
  const [clientes, setClientes] = useState<Record<string, string>>({})
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [aba, setAba] = useState<'kanban' | 'aprovacoes'>('kanban')
  const [mostraForm, setMostraForm] = useState(false)
  const [novoCliente, setNovoCliente] = useState('')
  const [novoCanal, setNovoCanal] = useState('email')
  const [novaMensagem, setNovaMensagem] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const [alerta, setAlerta] = useState<{ tipo: 'erro' | 'aviso'; mensagem: string } | null>(null)
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
      if (!perfil?.areas?.includes('vendas')) {
        router.push('/')
        return
      }

      const { data: cli } = await supabase.from('clientes').select('cod_cliente, nome')
      const mapa: Record<string, string> = {}
      cli?.forEach((c: any) => { mapa[c.cod_cliente] = c.nome })
      setClientes(mapa)

      await buscarPedidos()
      setCarregando(false)
    }
    verificar()

    const supabase = createClient()
    const canal = supabase
      .channel('pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_orcamento' }, () => buscarPedidos())
      .subscribe()
    return () => { canal.unsubscribe() }
  }, [router])

  const buscarPedidos = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('pedidos_orcamento').select().order('data', { ascending: false })
    if (data) setPedidos(data as PedidoOrcamento[])
  }

  const criarPedido = async () => {
    if (!novoCliente || !novaMensagem.trim()) {
      alert('Preencha cliente e mensagem')
      return
    }
    const supabase = createClient()
    const { data: ultimo } = await supabase
      .from('pedidos_orcamento')
      .select('cod_pedido')
      .order('cod_pedido', { ascending: false })
      .limit(1)

    let proximo = 'PED001'
    if (ultimo && ultimo.length > 0) {
      const n = parseInt(ultimo[0].cod_pedido.replace('PED', ''))
      proximo = `PED${String(n + 1).padStart(3, '0')}`
    }

    const { error } = await supabase.from('pedidos_orcamento').insert({
      cod_pedido: proximo,
      cod_cliente: novoCliente,
      canal: novoCanal,
      mensagem: novaMensagem,
      status: 'novo',
      data: new Date().toISOString(),
    })
    if (!error) {
      setNovoCliente('')
      setNovaMensagem('')
      setNovoCanal('email')
      setMostraForm(false)
      await buscarPedidos()
    } else {
      setAlerta({ tipo: 'erro', mensagem: error.message || 'Erro ao criar pedido' })
    }
  }

  const processar = async (cod_pedido: string) => {
    setProcessando(cod_pedido)
    setAlerta(null)
    try {
      const res = await fetch('/api/vendas/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_pedido }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setAlerta({ tipo: 'aviso', mensagem: data.erro })
        } else {
          setAlerta({ tipo: 'erro', mensagem: data.erro || 'Erro ao processar pedido' })
        }
        return
      }
      await buscarPedidos()
    } catch (err) {
      setAlerta({ tipo: 'erro', mensagem: err instanceof Error ? err.message : 'Erro' })
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
    acc[s] = pedidos.filter((p) => p.status === s)
    return acc
  }, {} as Record<string, PedidoOrcamento[]>)

  const pedidoSel = selecionado ? pedidos.find((p) => p.cod_pedido === selecionado) : null

  return (
    <div className="pagina-app">
      <Header contexto="Vendas · Orçamentos" usuarioEmail={user?.email} mostraInicio mostraLogout />

      {alerta && (
        <div
          style={{
            padding: 'var(--sp-4)',
            marginBottom: 'var(--sp-4)',
            borderRadius: 'var(--br)',
            background: alerta.tipo === 'aviso' ? 'var(--warning-bg)' : 'var(--danger-bg)',
            color: alerta.tipo === 'aviso' ? 'var(--warning-text)' : 'var(--danger-text)',
            border: `1px solid ${alerta.tipo === 'aviso' ? 'var(--warning)' : 'var(--danger)'}`,
          }}
        >
          {alerta.mensagem}
        </div>
      )}

      <main className="app-main">
        {/* Cabeçalho da tela */}
        <div className="tela-cabecalho">
          <div>
            <h1 className="app-titulo">Pedidos de orçamento</h1>
            <p className="app-subtitulo">Processe, acompanhe e aprove as respostas.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setMostraForm((v) => !v)}>
            <Icon type="mais" size="sm" />
            Novo pedido
          </button>
        </div>

        {/* Formulário novo pedido */}
        {mostraForm && (
          <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
            <div className="card-head">Novo pedido</div>
            <div className="card-body">
              <div className="form-grade">
                <div className="field">
                  <label htmlFor="cliente">Cliente</label>
                  <div className="select-wrap">
                    <select id="cliente" className="select" value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)}>
                      <option value="">Selecione…</option>
                      {Object.entries(clientes).map(([cod, nome]) => (
                        <option key={cod} value={cod}>{nome}</option>
                      ))}
                    </select>
                    <Icon type="chevron-baixo" size="sm" />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="canal">Canal</label>
                  <div className="select-wrap">
                    <select id="canal" className="select" value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)}>
                      <option value="email">E-mail</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telefone">Telefone</option>
                    </select>
                    <Icon type="chevron-baixo" size="sm" />
                  </div>
                </div>

                <div className="field field--larga">
                  <label htmlFor="mensagem">Mensagem do cliente</label>
                  <textarea
                    id="mensagem"
                    className="input"
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    placeholder="Cole aqui a mensagem recebida…"
                  />
                </div>
              </div>
            </div>
            <div className="card-foot">
              <button type="button" className="btn btn--secondary" onClick={() => setMostraForm(false)}>Cancelar</button>
              <button type="button" className="btn btn--primary" onClick={criarPedido}>
                <Icon type="check" size="sm" />
                Criar pedido
              </button>
            </div>
          </div>
        )}

        {/* Organograma do pedido selecionado */}
        {selecionado && (
          <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
            <div className="card-head">
              <Icon type="assistente" size="md" />
              Execução · {selecionado}
            </div>
            <div className="card-body">
              <Organograma area="vendas" item_id={selecionado} />
            </div>
          </div>
        )}

        {/* Abas */}
        <div className="tabs" style={{ marginBottom: 'var(--sp-5)' }}>
          <button className={`tab ${aba === 'kanban' ? 'is-ativo' : ''}`} onClick={() => setAba('kanban')}>
            <Icon type="painel" size="sm" />
            Kanban
          </button>
          <button className={`tab ${aba === 'aprovacoes' ? 'is-ativo' : ''}`} onClick={() => setAba('aprovacoes')}>
            <Icon type="check-duplo" size="sm" />
            Aprovações
          </button>
        </div>

        {aba === 'kanban' ? (
          <div className="kanban">
            {COLUNAS.map((status) => (
              <div key={status} className="coluna">
                <div className="coluna-head">
                  <span className="ponto" style={{ background: STATUS_META[status].ponto }} />
                  {STATUS_META[status].rotulo}
                  <span className="conta">{porStatus[status].length}</span>
                </div>

                {porStatus[status].map((pedido) => (
                  <div
                    key={pedido.cod_pedido}
                    className={`cartao ${selecionado === pedido.cod_pedido ? 'is-selected' : ''}`}
                    onClick={() => setSelecionado(pedido.cod_pedido)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="cartao-codigo">{pedido.cod_pedido}</div>
                    <div className="cartao-linha">{clientes[pedido.cod_cliente] || pedido.cod_cliente}</div>
                    <div className="cartao-linha">
                      {pedido.canal} · {new Date(pedido.data).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="cartao-msg">{pedido.mensagem}</div>

                    {status === 'novo' && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm btn--block"
                        style={{ marginTop: 'var(--sp-3)' }}
                        disabled={processando === pedido.cod_pedido}
                        onClick={(e) => {
                          e.stopPropagation()
                          processar(pedido.cod_pedido)
                        }}
                      >
                        {processando === pedido.cod_pedido ? <span className="spinner" /> : <Icon type="raio" size="sm" />}
                        {processando === pedido.cod_pedido ? 'Processando…' : 'Processar'}
                      </button>
                    )}
                  </div>
                ))}

                {porStatus[status].length === 0 && (
                  <p className="estado-vazio" style={{ padding: 'var(--sp-6) 0' }}>Nenhum pedido</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ height: 620, overflow: 'hidden' }}>
            {user && <FilaAprovacao area="vendas" usuarioId={user.id} />}
          </div>
        )}
      </main>

      {/* Painel lateral */}
      {pedidoSel && (
        <>
          <div className="drawer-scrim" onClick={() => setSelecionado(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <h3 style={{ fontFamily: 'var(--font-mono)' }}>{pedidoSel.cod_pedido}</h3>
                <p className="app-subtitulo">{clientes[pedidoSel.cod_cliente]}</p>
              </div>
              <button type="button" className="icone-btn" onClick={() => setSelecionado(null)} aria-label="Fechar">
                <Icon type="fechar" size="md" />
              </button>
            </div>
            <LinhaDoTempo item_id={pedidoSel.cod_pedido} />
          </aside>
        </>
      )}
    </div>
  )
}
