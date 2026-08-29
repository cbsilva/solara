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
  saida: Record<string, any> | null
}

interface OrganogramaProps {
  area: string
  item_id: string
}

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ['triador', 'pesquisador', 'redator', 'revisor'],
  financeiro: ['investigador', 'consolidador', 'revisor'],
}

export function Organograma({ area, item_id }: OrganogramaProps) {
  const [execucoes, setExecucoes] = useState<Record<string, Execucao>>({})
  const [orquestrador, setOrquestrador] = useState<Execucao | null>(null)
  const [revisorReprovouPor, setRevisorReprovouPor] = useState<number>(0)

  useEffect(() => {
    const supabase = createClient()

    // Buscar execuções iniciais
    const buscarExecucoes = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select()
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })

      if (data) {
        const executaco_map: Record<string, Execucao> = {}
        let orch = null

        for (const exec of data) {
          if (exec.agente === 'orquestrador') {
            orch = exec
          } else {
            executaco_map[exec.agente] = exec
          }
        }

        setOrquestrador(orch)
        setExecucoes(executaco_map)
      }
    }

    buscarExecucoes()

    // Assinar Realtime
    const channel = supabase
      .channel(`execucoes-${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
          filter: `item_id=eq.${item_id}`,
        },
        (payload) => {
          const exec = payload.new as Execucao

          if (exec.agente === 'orquestrador') {
            setOrquestrador(exec)
          } else {
            setExecucoes((prev) => ({
              ...prev,
              [exec.agente]: exec,
            }))

            // Se revisor reprovou (saida.aprovado = false), mostrar seta vermelha por 3s
            if (
              exec.agente === 'revisor' &&
              exec.saida &&
              exec.saida.aprovado === false
            ) {
              setRevisorReprovouPor(Date.now() + 3000)
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [item_id])

  const agentes = AGENTES_POR_AREA[area] || []

  if (!orquestrador && Object.keys(execucoes).length === 0) {
    return (
      <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
        Nenhuma execução ainda
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '40px',
      }}
    >
      {/* Orquestrador */}
      {orquestrador && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CartaoAgente exec={orquestrador} />
        </div>
      )}

      {/* Setas e agentes */}
      {orquestrador && agentes.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '20px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {agentes.map((agente) => {
            const exec = execucoes[agente]
            const sertaVermelha =
              agente === 'revisor' && revisorReprovouPor > Date.now()

            return (
              <div
                key={agente}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                {/* Seta do orquestrador */}
                <div
                  style={{
                    width: '2px',
                    height: '30px',
                    backgroundColor: sertaVermelha ? '#d32f2f' : '#ccc',
                    transition: 'background-color 0.3s',
                  }}
                />

                {/* Cartão do agente */}
                {exec ? (
                  <CartaoAgente exec={exec} />
                ) : area === 'financeiro' && agente === 'investigador' ? (
                  <CartaoAgentePlaceholder agente={agente} />
                ) : (
                  <CartaoAgentePlaceholder agente={agente} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CartaoAgente({ exec }: { exec: Execucao }) {
  const getBackground = () => {
    if (exec.status === 'rodando') return '#e3f2fd'
    if (exec.status === 'ok') return '#4caf50'
    if (exec.status === 'erro') return '#d32f2f'
    return '#f5f5f5'
  }

  const getColor = () => {
    if (exec.status === 'ok' || exec.status === 'erro') return 'white'
    return '#333'
  }

  const tempoSegundos =
    exec.fim && exec.inicio
      ? Math.round(
          (new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()) /
            1000
        )
      : null

  const investigadorStatus =
    exec.agente === 'investigador'
      ? ` (rodando)` // Seria "N rodando / M concluídos" com dados reais
      : ''

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        backgroundColor: getBackground(),
        color: getColor(),
        minWidth: '140px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 'bold',
        animation:
          exec.status === 'rodando'
            ? 'pulse 1.5s infinite'
            : 'none',
      }}
    >
      <div>{exec.agente}</div>
      {exec.status === 'ok' && tempoSegundos !== null && (
        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
          {tempoSegundos}s • {(exec.tokens_entrada || 0) + (exec.tokens_saida || 0)}t
        </div>
      )}
      {exec.status === 'erro' && (
        <div style={{ fontSize: '12px', marginTop: '4px' }}>Erro</div>
      )}
      {exec.agente === 'investigador' && (
        <div style={{ fontSize: '12px', marginTop: '4px' }}>rodando</div>
      )}
    </div>
  )
}

function CartaoAgentePlaceholder({ agente }: { agente: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        backgroundColor: '#f5f5f5',
        color: '#ccc',
        minWidth: '140px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 'bold',
      }}
    >
      {agente}
    </div>
  )
}

// CSS global para animação de pulse
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `
  document.head.appendChild(style)
}
