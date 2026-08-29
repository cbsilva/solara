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

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ['triador', 'pesquisador', 'redator', 'revisor'],
  financeiro: ['investigador', 'consolidador', 'revisor'],
  rh: ['triador', 'pesquisador', 'redator', 'revisor'],
}

export function Organograma({ area, item_id }: { area: string; item_id: string }) {
  const [execucoes, setExecucoes] = useState<Record<string, Execucao>>({})
  const [orquestrador, setOrquestrador] = useState<Execucao | null>(null)
  const [revisorReprovouAte, setRevisorReprovouAte] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    const buscar = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select()
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })
      if (!data) return
      const mapa: Record<string, Execucao> = {}
      let orch: Execucao | null = null
      for (const exec of data) {
        if (exec.agente === 'orquestrador') orch = exec
        else mapa[exec.agente] = exec
      }
      setOrquestrador(orch)
      setExecucoes(mapa)
    }

    buscar()

    const canal = supabase
      .channel(`execucoes-${item_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execucoes_agentes', filter: `item_id=eq.${item_id}` },
        (payload) => {
          const exec = payload.new as Execucao
          if (exec.agente === 'orquestrador') {
            setOrquestrador(exec)
          } else {
            setExecucoes((prev) => ({ ...prev, [exec.agente]: exec }))
            if (exec.agente === 'revisor' && exec.saida?.aprovado === false) {
              setRevisorReprovouAte(Date.now() + 3000)
            }
          }
        }
      )
      .subscribe()

    return () => {
      canal.unsubscribe()
    }
  }, [item_id])

  const agentes = AGENTES_POR_AREA[area] || []

  if (!orquestrador && Object.keys(execucoes).length === 0) {
    return <p className="estado-vazio">Nenhuma execução ainda. Processe um item para acompanhar aqui.</p>
  }

  return (
    <div className="organograma">
      {orquestrador && (
        <div className="org-raiz">
          <CartaoAgente exec={orquestrador} />
        </div>
      )}

      {orquestrador && agentes.length > 0 && (
        <>
          <div className="org-conector" />
          <div className="org-agentes">
            {agentes.map((agente) => {
              const exec = execucoes[agente]
              const setaVermelha = agente === 'revisor' && revisorReprovouAte > Date.now()
              return (
                <div key={agente} className="org-ramo">
                  <div className={`org-haste ${setaVermelha ? 'is-reprovado' : ''}`} />
                  {exec ? <CartaoAgente exec={exec} /> : <CartaoVazio agente={agente} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CartaoAgente({ exec }: { exec: Execucao }) {
  const segundos =
    exec.fim && exec.inicio
      ? Math.round((new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()) / 1000)
      : null
  const tokens = (exec.tokens_entrada || 0) + (exec.tokens_saida || 0)

  return (
    <div className={`org-cartao org-cartao--${exec.status}`}>
      <span className="org-nome">{exec.agente}</span>
      {exec.status === 'ok' && segundos !== null && (
        <span className="org-meta">{segundos}s · {tokens}t</span>
      )}
      {exec.status === 'rodando' && <span className="org-meta">rodando…</span>}
      {exec.status === 'erro' && <span className="org-meta">erro</span>}
    </div>
  )
}

function CartaoVazio({ agente }: { agente: string }) {
  return (
    <div className="org-cartao org-cartao--vazio">
      <span className="org-nome">{agente}</span>
    </div>
  )
}
