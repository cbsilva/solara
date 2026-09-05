'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
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
  chamado_por: string | null
}

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ['triador', 'pesquisador', 'redator', 'revisor'],
  financeiro: ['investigador', 'consolidador', 'revisor'],
  rh: ['triador', 'pesquisador', 'redator', 'revisor'],
}

export function Organograma({ area, item_id }: { area: string; item_id: string }) {
  const [execucoesPorAgente, setExecucoesPorAgente] = useState<Record<string, Execucao[]>>({})
  const [orquestrador, setOrquestrador] = useState<Execucao | null>(null)
  const [revisorReprovouAte, setRevisorReprovouAte] = useState(0)
  // Id da execucao raiz atual, para so contar/agregar agentes dela -- sem isso
  // o Organograma acumula o historico inteiro do item (todas as tentativas de
  // processar/investigar), e um erro de uma tentativa antiga deixava o
  // cartao vermelho mesmo com a rodada mais recente tendo dado certo.
  const orquestradorIdRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const buscar = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select()
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })
      if (!data) return

      let orch: Execucao | null = null
      for (const exec of data) {
        if (exec.agente === 'orquestrador') orch = exec
      }

      const porAgente: Record<string, Execucao[]> = {}
      if (orch) {
        for (const exec of data) {
          if (exec.agente !== 'orquestrador' && exec.chamado_por === orch.id) {
            porAgente[exec.agente] = [...(porAgente[exec.agente] || []), exec]
          }
        }
      }

      orquestradorIdRef.current = orch?.id || null
      setOrquestrador(orch)
      setExecucoesPorAgente(porAgente)
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
            if (orquestradorIdRef.current !== exec.id) {
              // Nova execucao raiz (nova tentativa): reinicia os cartoes da rodada anterior
              orquestradorIdRef.current = exec.id
              setExecucoesPorAgente({})
            }
            setOrquestrador(exec)
          } else if (exec.chamado_por === orquestradorIdRef.current) {
            setExecucoesPorAgente((prev) => {
              const semAntiga = (prev[exec.agente] || []).filter((e) => e.id !== exec.id)
              return { ...prev, [exec.agente]: [...semAntiga, exec] }
            })
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

  if (!orquestrador && Object.keys(execucoesPorAgente).length === 0) {
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
            {agentes.map((agente, idx) => {
              const execs = execucoesPorAgente[agente] || []
              const setaVermelha = agente === 'revisor' && revisorReprovouAte > Date.now()
              const conectorRevisorRedator = agente === 'revisor' && agentes[idx - 1] === 'redator'
              return (
                <Fragment key={agente}>
                  {conectorRevisorRedator && (
                    <div className={`org-seta-h ${setaVermelha ? 'is-reprovado' : ''}`} />
                  )}
                  <div className="org-ramo">
                    <div className={`org-haste ${setaVermelha ? 'is-reprovado' : ''}`} />
                    {execs.length === 0 && <CartaoVazio agente={agente} />}
                    {execs.length === 1 && <CartaoAgente exec={execs[0]} />}
                    {execs.length > 1 && <CartaoAgregado agente={agente} execs={execs} />}
                  </div>
                </Fragment>
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

function CartaoAgregado({ agente, execs }: { agente: string; execs: Execucao[] }) {
  const rodando = execs.filter((e) => e.status === 'rodando').length
  const concluidos = execs.length - rodando
  const status = rodando > 0 ? 'rodando' : execs.some((e) => e.status === 'erro') ? 'erro' : 'ok'

  return (
    <div className={`org-cartao org-cartao--${status}`}>
      <span className="org-nome">{agente}</span>
      <span className="org-meta">{rodando} rodando / {concluidos} concluídos</span>
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
