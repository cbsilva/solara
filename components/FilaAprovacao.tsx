'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Aprovacao {
  id: string
  area: string
  item_tipo: string
  item_id: string
  titulo: string
  proposta: Record<string, any>
  status: string
  decidido_por: string | null
  decidido_em: string | null
  observacao: string | null
}

interface FilaAprovacaoProps {
  area: string
  usuarioId: string
}

export function FilaAprovacao({ area, usuarioId }: FilaAprovacaoProps) {
  const [itens, setItens] = useState<Aprovacao[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [propostEditada, setPropostaEditada] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [modoPendente, setModoPendente] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const buscarItens = async () => {
      const filtro = modoPendente ? 'pendente' : '*'
      const query = supabase
        .from('aprovacoes')
        .select()
        .eq('area', area)

      if (modoPendente) {
        query.eq('status', 'pendente')
      }

      const { data } = await query.order('created_at', { ascending: true })

      if (data) {
        setItens(data as Aprovacao[])
      }
    }

    buscarItens()

    // Realtime
    const channel = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aprovacoes',
          filter: `area=eq.${area}`,
        },
        () => {
          buscarItens()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [area, modoPendente])

  const itemSelecionado = selecionado
    ? itens.find((i) => i.id === selecionado)
    : null

  const handleAprovar = async (id: string, editada = false) => {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('aprovacoes')
      .update({
        status: editada ? 'editada' : 'aprovada',
        proposta: editada ? JSON.parse(propostEditada) : undefined,
        decidido_por: usuarioId,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', id)

    if (!error) {
      setSelecionado(null)
      setPropostaEditada('')
    }

    setLoading(false)
  }

  const handleRejeitar = async (id: string) => {
    if (!observacao.trim()) {
      alert('Adicione uma observação ao rejeitar')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('aprovacoes')
      .update({
        status: 'rejeitada',
        decidido_por: usuarioId,
        decidido_em: new Date().toISOString(),
        observacao,
      })
      .eq('id', id)

    if (!error) {
      setSelecionado(null)
      setObservacao('')
    }

    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #eee' }}>
        <div style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
          <label>
            <input
              type="checkbox"
              checked={modoPendente}
              onChange={(e) => setModoPendente(e.target.checked)}
            />
            {' '}Apenas pendentes
          </label>
        </div>

        {itens.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              setSelecionado(item.id)
              setPropostaEditada(JSON.stringify(item.proposta, null, 2))
              setObservacao('')
            }}
            style={{
              padding: '12px',
              borderBottom: '1px solid #eee',
              cursor: 'pointer',
              backgroundColor: selecionado === item.id ? '#e3f2fd' : 'white',
              transition: 'background-color 0.2s',
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
              {item.titulo}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {item.item_tipo} • {item.item_id}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#999',
                marginTop: '4px',
                padding: '4px 6px',
                backgroundColor: '#f5f5f5',
                borderRadius: '3px',
                display: 'inline-block',
              }}
            >
              {item.status}
            </div>
          </div>
        ))}

        {itens.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            Nenhum item
          </div>
        )}
      </div>

      {/* Detalhe */}
      {itemSelecionado && (
        <div style={{ flex: 2, padding: '20px', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>{itemSelecionado.titulo}</h3>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
              Proposta
            </label>
            <textarea
              value={propostEditada}
              onChange={(e) => setPropostaEditada(e.target.value)}
              style={{
                width: '100%',
                height: '200px',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {itemSelecionado.status === 'pendente' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Observação (para rejeitar)
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Por favor, explique por que está rejeitando..."
                  style={{
                    width: '100%',
                    height: '100px',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleAprovar(itemSelecionado.id, false)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Aprovar
                </button>
                <button
                  onClick={() => handleAprovar(itemSelecionado.id, true)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Salvar e Aprovar
                </button>
                <button
                  onClick={() => handleRejeitar(itemSelecionado.id)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#d32f2f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Rejeitar
                </button>
              </div>
            </>
          )}

          {itemSelecionado.status !== 'pendente' && (
            <div style={{ padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div>
                <strong>Status:</strong> {itemSelecionado.status}
              </div>
              {itemSelecionado.decidido_em && (
                <div>
                  <strong>Decidido em:</strong>{' '}
                  {new Date(itemSelecionado.decidido_em).toLocaleString('pt-BR')}
                </div>
              )}
              {itemSelecionado.observacao && (
                <div style={{ marginTop: '10px' }}>
                  <strong>Observação:</strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: '5px' }}>
                    {itemSelecionado.observacao}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
