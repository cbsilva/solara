'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'

interface PedidoOrcamento {
  cod_pedido: string
  cod_cliente: string
  cliente_nome: string
  mensagem: string
  canal: string
  data: string
  status: string
}

interface ClienteData {
  nome: string
}

export default function VendasPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [perfil, setPerfil] = useState<{ areas: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [pedidos, setPedidos] = useState<PedidoOrcamento[]>([])
  const [clientes, setClientes] = useState<Record<string, string>>({})
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [aba, setAba] = useState<'kanban' | 'aprovacoes'>('kanban')
  const [mostraFormulario, setMostraFormulario] = useState(false)
  const [novoCliente, setNovoCliente] = useState('')
  const [novoCanal, setNovoCanal] = useState('email')
  const [novoMensagem, setNovoMensagem] = useState('')
  const [processando, setProcessando] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser({ id: session.user.id, email: session.user.email || '' })

      // Verificar permissão
      const { data: perfilData } = await supabase
        .from('perfis')
        .select()
        .eq('id', session.user.id)
        .single()

      if (!perfilData?.areas?.includes('vendas')) {
        router.push('/')
        return
      }

      setPerfil(perfilData)

      // Buscar clientes
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('cod_cliente, nome')

      const clientesMap: Record<string, string> = {}
      clientesData?.forEach((c: any) => {
        clientesMap[c.cod_cliente] = c.nome
      })
      setClientes(clientesMap)

      // Buscar pedidos
      const { data: pedidosData } = await supabase
        .from('pedidos_orcamento')
        .select()
        .order('data', { ascending: false })

      if (pedidosData) {
        setPedidos(pedidosData as PedidoOrcamento[])
      }

      setLoading(false)
    }

    checkAuth()

    // Realtime
    const supabase = createClient()
    const channel = supabase
      .channel('pedidos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_orcamento' },
        () => {
          buscarPedidos()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [router])

  const buscarPedidos = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('pedidos_orcamento')
      .select()
      .order('data', { ascending: false })

    if (data) {
      setPedidos(data as PedidoOrcamento[])
    }
  }

  const handleNovoPedido = async () => {
    if (!novoCliente || !novoMensagem.trim()) {
      alert('Preencha cliente e mensagem')
      return
    }

    const supabase = createClient()

    // Gerar próximo cod_pedido (PED001, PED002, etc)
    const { data: ultimoPedido } = await supabase
      .from('pedidos_orcamento')
      .select('cod_pedido')
      .order('cod_pedido', { ascending: false })
      .limit(1)

    let proximo = 'PED001'
    if (ultimoPedido && ultimoPedido.length > 0) {
      const ultimoNum = parseInt(
        ultimoPedido[0].cod_pedido.replace('PED', '')
      )
      proximo = `PED${String(ultimoNum + 1).padStart(3, '0')}`
    }

    const { error } = await supabase.from('pedidos_orcamento').insert({
      cod_pedido: proximo,
      cod_cliente: novoCliente,
      cliente_nome: clientes[novoCliente],
      canal: novoCanal,
      mensagem: novoMensagem,
      status: 'novo',
      data: new Date().toISOString(),
    })

    if (!error) {
      setNovoCliente('')
      setNovoMensagem('')
      setNovoCanal('email')
      setMostraFormulario(false)
      await buscarPedidos()
    }
  }

  const handleProcessar = async (cod_pedido: string) => {
    setProcessando(cod_pedido)
    try {
      const res = await fetch('/api/vendas/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_pedido }),
      })

      if (!res.ok) {
        throw new Error('Erro ao processar pedido')
      }

      await buscarPedidos()
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Erro ao processar pedido'
      )
    } finally {
      setProcessando(null)
    }
  }

  const statusesKanban = ['novo', 'processando', 'aguardando_aprovacao', 'respondido', 'rejeitado']
  const pedidosPorStatus = statusesKanban.reduce(
    (acc, status) => {
      acc[status] = pedidos.filter((p) => p.status === status)
      return acc
    },
    {} as Record<string, PedidoOrcamento[]>
  )

  if (loading) return <div style={{ padding: '20px' }}>Carregando...</div>

  const pedidoSelecionado = selecionado ? pedidos.find((p) => p.cod_pedido === selecionado) : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Vendas</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setMostraFormulario(!mostraFormulario)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Novo Pedido
            </button>
          </div>
        </div>
      </div>

      {/* Organograma */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', minHeight: '100px' }}>
          {selecionado ? (
            <Organograma area="vendas" item_id={selecionado} />
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
              Selecione um pedido para ver o organograma
            </div>
          )}
        </div>
      </div>

      {/* Formulário */}
      {mostraFormulario && (
        <div style={{ backgroundColor: '#f9f9f9', padding: '15px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Cliente</label>
                <select
                  value={novoCliente}
                  onChange={(e) => setNovoCliente(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">Selecione...</option>
                  {Object.entries(clientes).map(([cod, nome]) => (
                    <option key={cod} value={cod}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Canal</label>
                <select
                  value={novoCanal}
                  onChange={(e) => setNovoCanal(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telefone">Telefone</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Mensagem</label>
                <textarea
                  value={novoMensagem}
                  onChange={(e) => setNovoMensagem(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', minHeight: '60px' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                onClick={handleNovoPedido}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Criar
              </button>
              <button
                onClick={() => setMostraFormulario(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#999',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abas */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '0 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '20px' }}>
          <button
            onClick={() => setAba('kanban')}
            style={{
              padding: '12px 20px',
              backgroundColor: aba === 'kanban' ? '#1976d2' : 'transparent',
              color: aba === 'kanban' ? 'white' : '#333',
              border: 'none',
              borderBottom: aba === 'kanban' ? '3px solid #1976d2' : 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Kanban
          </button>
          <button
            onClick={() => setAba('aprovacoes')}
            style={{
              padding: '12px 20px',
              backgroundColor: aba === 'aprovacoes' ? '#1976d2' : 'transparent',
              color: aba === 'aprovacoes' ? 'white' : '#333',
              border: 'none',
              borderBottom: aba === 'aprovacoes' ? '3px solid #1976d2' : 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Aprovações
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        {/* Kanban ou Aprovações */}
        <div>
          {aba === 'kanban' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
              {statusesKanban.map((status) => (
                <div key={status} style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '12px' }}>
                  <h4 style={{ margin: '0 0 15px 0', textTransform: 'capitalize', color: '#333' }}>
                    {status.replace(/_/g, ' ')}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pedidosPorStatus[status].map((pedido) => (
                      <div
                        key={pedido.cod_pedido}
                        onClick={() => setSelecionado(pedido.cod_pedido)}
                        style={{
                          backgroundColor: selecionado === pedido.cod_pedido ? '#e3f2fd' : 'white',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid #ddd',
                          cursor: 'pointer',
                          fontSize: '13px',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {pedido.cod_pedido}
                        </div>
                        <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>
                          {clientes[pedido.cod_cliente] || pedido.cod_cliente}
                        </div>
                        <div style={{ color: '#999', fontSize: '11px', marginBottom: '6px' }}>
                          {pedido.canal} • {new Date(pedido.data).toLocaleDateString('pt-BR')}
                        </div>
                        <div style={{ color: '#555', lineHeight: '1.3' }}>
                          {pedido.mensagem.substring(0, 60)}...
                        </div>
                        {status === 'novo' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleProcessar(pedido.cod_pedido)
                            }}
                            disabled={processando === pedido.cod_pedido}
                            style={{
                              marginTop: '8px',
                              padding: '6px 8px',
                              backgroundColor: processando === pedido.cod_pedido ? '#ccc' : '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: processando === pedido.cod_pedido ? 'default' : 'pointer',
                              fontSize: '12px',
                              width: '100%',
                            }}
                          >
                            {processando === pedido.cod_pedido ? 'Processando...' : 'Processar'}
                          </button>
                        )}
                      </div>
                    ))}
                    {pedidosPorStatus[status].length === 0 && (
                      <div style={{ color: '#ccc', textAlign: 'center', padding: '20px 0' }}>
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            user && (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', height: '600px' }}>
                <FilaAprovacao area="vendas" usuarioId={user.id} />
              </div>
            )
          )}
        </div>

        {/* Painel lateral */}
        {pedidoSelecionado && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
              <h4 style={{ margin: 0 }}>{pedidoSelecionado.cod_pedido}</h4>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                {clientes[pedidoSelecionado.cod_cliente]}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <LinhaDoTempo item_id={pedidoSelecionado.cod_pedido} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
