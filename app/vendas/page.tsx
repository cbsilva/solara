'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'
import { Header } from '@/components/Header'

interface PedidoOrcamento {
  cod_pedido: string
  cod_cliente: string
  cliente_nome: string
  mensagem: string
  canal: string
  data: string
  status: string
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

      const { data: clientesData } = await supabase
        .from('clientes')
        .select('cod_cliente, nome')

      const clientesMap: Record<string, string> = {}
      clientesData?.forEach((c: any) => {
        clientesMap[c.cod_cliente] = c.nome
      })
      setClientes(clientesMap)

      await buscarPedidos()
      setLoading(false)
    }

    checkAuth()

    const supabase = createClient()
    const channel = supabase
      .channel('pedidos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_orcamento' },
        () => buscarPedidos()
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
    const { data: ultimoPedido } = await supabase
      .from('pedidos_orcamento')
      .select('cod_pedido')
      .order('cod_pedido', { ascending: false })
      .limit(1)

    let proximo = 'PED001'
    if (ultimoPedido && ultimoPedido.length > 0) {
      const ultimoNum = parseInt(ultimoPedido[0].cod_pedido.replace('PED', ''))
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

      if (!res.ok) throw new Error('Erro ao processar')
      await buscarPedidos()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setProcessando(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  const statusesKanban = ['novo', 'processando', 'aguardando_aprovacao', 'respondido', 'rejeitado']
  const pedidosPorStatus = statusesKanban.reduce(
    (acc, status) => {
      acc[status] = pedidos.filter((p) => p.status === status)
      return acc
    },
    {} as Record<string, PedidoOrcamento[]>
  )

  const pedidoSelecionado = selecionado ? pedidos.find((p) => p.cod_pedido === selecionado) : null

  const statusConfig: Record<string, { cor: string; icone: string }> = {
    novo: { cor: 'bg-blue-50 border-blue-200', icone: '📝' },
    processando: { cor: 'bg-yellow-50 border-yellow-200', icone: '⚙️' },
    aguardando_aprovacao: { cor: 'bg-purple-50 border-purple-200', icone: '⏳' },
    respondido: { cor: 'bg-green-50 border-green-200', icone: '✅' },
    rejeitado: { cor: 'bg-red-50 border-red-200', icone: '❌' },
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Vendas - Processamento de Orçamentos"
        usuarioEmail={user?.email}
        mostraLogout
      />

      {/* Organograma */}
      {selecionado && (
        <div className="bg-white border-b border-gray-200 p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <Organograma area="vendas" item_id={selecionado} />
          </div>
        </div>
      )}

      {/* Botões de Ação */}
      <div className="bg-white border-b border-gray-200 p-4 md:p-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <button
            onClick={() => setMostraFormulario(!mostraFormulario)}
            className="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>➕</span>
            Novo Pedido
          </button>

          {/* Abas */}
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => setAba('kanban')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg font-medium transition-all ${
                aba === 'kanban'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 Kanban
            </button>
            <button
              onClick={() => setAba('aprovacoes')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg font-medium transition-all ${
                aba === 'aprovacoes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✅ Aprovações
            </button>
          </div>
        </div>
      </div>

      {/* Formulário Novo Pedido */}
      {mostraFormulario && (
        <div className="bg-blue-50 border-b border-blue-200 p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Criar Novo Pedido</h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="label">Cliente</label>
                  <select
                    value={novoCliente}
                    onChange={(e) => setNovoCliente(e.target.value)}
                    className="input-field"
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
                  <label className="label">Canal</label>
                  <select
                    value={novoCanal}
                    onChange={(e) => setNovoCanal(e.target.value)}
                    className="input-field"
                  >
                    <option value="email">📧 Email</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="telefone">📞 Telefone</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Mensagem</label>
                  <textarea
                    value={novoMensagem}
                    onChange={(e) => setNovoMensagem(e.target.value)}
                    placeholder="Digite a mensagem do cliente..."
                    className="input-field resize-none h-10"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleNovoPedido}
                  className="btn-primary"
                >
                  ✓ Criar Pedido
                </button>
                <button
                  onClick={() => setMostraFormulario(false)}
                  className="btn-secondary"
                >
                  ✕ Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {aba === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {statusesKanban.map((status) => (
              <div
                key={status}
                className={`rounded-xl p-4 border-2 ${statusConfig[status].cor}`}
              >
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>{statusConfig[status].icone}</span>
                  <span className="text-sm capitalize">
                    {status.replace(/_/g, ' ')}
                  </span>
                  <span className="ml-auto bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-semibold">
                    {pedidosPorStatus[status].length}
                  </span>
                </h3>

                <div className="space-y-3">
                  {pedidosPorStatus[status].map((pedido) => (
                    <button
                      key={pedido.cod_pedido}
                      onClick={() => setSelecionado(pedido.cod_pedido)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        selecionado === pedido.cod_pedido
                          ? 'bg-white border-blue-500 shadow-md'
                          : 'bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="font-bold text-gray-900">{pedido.cod_pedido}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {clientes[pedido.cod_cliente] || pedido.cod_cliente}
                      </div>
                      <div className="text-xs text-gray-600 mt-2">
                        {pedido.canal} • {new Date(pedido.data).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="text-xs text-gray-700 mt-2 line-clamp-2">
                        {pedido.mensagem}
                      </div>

                      {status === 'novo' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleProcessar(pedido.cod_pedido)
                          }}
                          disabled={processando === pedido.cod_pedido}
                          className="mt-3 w-full px-3 py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                        >
                          {processando === pedido.cod_pedido ? '⏳ Processando...' : '🚀 Processar'}
                        </button>
                      )}
                    </button>
                  ))}

                  {pedidosPorStatus[status].length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm">Vazio</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200" style={{ height: '600px' }}>
            {user && <FilaAprovacao area="vendas" usuarioId={user.id} />}
          </div>
        )}
      </main>

      {/* Painel Lateral */}
      {pedidoSelecionado && aba === 'kanban' && (
        <div className="fixed inset-0 bg-black/50 md:hidden z-40" onClick={() => setSelecionado(null)} />
      )}
      {pedidoSelecionado && (
        <div className="hidden md:block fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={() => setSelecionado(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
            >
              ✕
            </button>
            <h3 className="font-bold text-gray-900">{pedidoSelecionado.cod_pedido}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {clientes[pedidoSelecionado.cod_cliente]}
            </p>
          </div>
          <div className="flex-1">
            <LinhaDoTempo item_id={pedidoSelecionado.cod_pedido} />
          </div>
        </div>
      )}
    </div>
  )
}
