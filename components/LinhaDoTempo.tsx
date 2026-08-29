'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Execucao {
  id: string
  agente: string
  status: string
  inicio: string
  fim: string | null
  tokens_entrada: number | null
  tokens_saida: number | null
  entrada: Record<string, any> | null
  saida: Record<string, any> | null
  erro: string | null
}

interface LinhaDoTempoProps {
  item_id: string
}

export function LinhaDoTempo({ item_id }: LinhaDoTempoProps) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const buscarExecucoes = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select()
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })

      if (data) {
        setExecucoes(data as Execucao[])
      }
    }

    buscarExecucoes()

    // Realtime
    const channel = supabase
      .channel(`timeline-${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
          filter: `item_id=eq.${item_id}`,
        },
        () => {
          buscarExecucoes()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [item_id])

  const getStatusCor = (status: string) => {
    if (status === 'rodando') return '#2196f3'
    if (status === 'ok') return '#4caf50'
    if (status === 'erro') return '#d32f2f'
    return '#999'
  }

  const getTempoTexto = (exec: Execucao) => {
    if (!exec.fim || !exec.inicio) return ''
    const ms = new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()
    const segundos = Math.round(ms / 1000)
    return `${segundos}s`
  }

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginTop: 0 }}>Execuções</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {execucoes.map((exec, idx) => (
          <div key={exec.id}>
            {/* Linha */}
            <div
              onClick={() =>
                setExpandido(expandido === exec.id ? null : exec.id)
              }
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                border: `2px solid ${getStatusCor(exec.status)}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                backgroundColor: expandido === exec.id ? '#f5f5f5' : 'white',
              }}
            >
              {/* Número */}
              <div
                style={{
                  minWidth: '30px',
                  fontWeight: 'bold',
                  color: '#999',
                }}
              >
                {idx + 1}
              </div>

              {/* Info principal */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>
                  {exec.agente}{' '}
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'white',
                      backgroundColor: getStatusCor(exec.status),
                      padding: '2px 6px',
                      borderRadius: '3px',
                      marginLeft: '8px',
                    }}
                  >
                    {exec.status}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {new Date(exec.inicio).toLocaleTimeString('pt-BR')}
                  {getTempoTexto(exec) && ` • ${getTempoTexto(exec)}`}
                  {exec.tokens_entrada && (
                    <>
                      {' '}
                      •{' '}
                      {(exec.tokens_entrada || 0) +
                        (exec.tokens_saida || 0)}{' '}
                      tokens
                    </>
                  )}
                </div>
              </div>

              {/* Seta */}
              <div
                style={{
                  fontSize: '12px',
                  color: '#999',
                  alignSelf: 'center',
                }}
              >
                {expandido === exec.id ? '▼' : '▶'}
              </div>
            </div>

            {/* Expandido */}
            {expandido === exec.id && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '6px',
                  marginLeft: '8px',
                  borderLeft: `4px solid ${getStatusCor(exec.status)}`,
                }}
              >
                {exec.entrada && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                      Entrada
                    </div>
                    <pre
                      style={{
                        backgroundColor: 'white',
                        padding: '10px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '12px',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(exec.entrada, null, 2)}
                    </pre>
                  </div>
                )}

                {exec.saida && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                      Saída
                    </div>
                    <pre
                      style={{
                        backgroundColor: 'white',
                        padding: '10px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '12px',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(exec.saida, null, 2)}
                    </pre>
                  </div>
                )}

                {exec.erro && (
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#d32f2f' }}>
                      Erro
                    </div>
                    <div
                      style={{
                        backgroundColor: '#ffebee',
                        padding: '10px',
                        borderRadius: '4px',
                        color: '#c62828',
                        fontSize: '12px',
                      }}
                    >
                      {exec.erro}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {execucoes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
            Nenhuma execução
          </div>
        )}
      </div>
    </div>
  )
}
