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

const BADGE: Record<string, string> = {
  rodando: 'badge--info',
  ok: 'badge--success',
  erro: 'badge--danger',
}

export function LinhaDoTempo({ item_id }: { item_id: string }) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const buscar = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select()
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })
      if (data) setExecucoes(data as Execucao[])
    }

    buscar()

    const canal = supabase
      .channel(`timeline-${item_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execucoes_agentes', filter: `item_id=eq.${item_id}` },
        () => buscar()
      )
      .subscribe()

    return () => {
      canal.unsubscribe()
    }
  }, [item_id])

  const tempo = (e: Execucao) => {
    if (!e.fim || !e.inicio) return null
    return `${Math.round((new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 1000)}s`
  }

  return (
    <div className="linha-tempo">
      <p className="rotulo-mini">Execuções</p>

      {execucoes.length === 0 && <p className="estado-vazio">Nenhuma execução</p>}

      {execucoes.map((exec, idx) => {
        const aberto = expandido === exec.id
        const tokens = (exec.tokens_entrada || 0) + (exec.tokens_saida || 0)
        return (
          <div key={exec.id} className="lt-item">
            <button type="button" className="lt-linha" onClick={() => setExpandido(aberto ? null : exec.id)}>
              <span className="lt-num">{idx + 1}</span>
              <span className="lt-info">
                <span className="lt-agente">
                  {exec.agente}
                  <span className={`badge ${BADGE[exec.status] || 'badge--neutral'}`}>{exec.status}</span>
                </span>
                <span className="lt-meta">
                  {new Date(exec.inicio).toLocaleTimeString('pt-BR')}
                  {tempo(exec) && ` · ${tempo(exec)}`}
                  {tokens > 0 && ` · ${tokens} tokens`}
                </span>
              </span>
              <span className="lt-chevron">{aberto ? '▾' : '▸'}</span>
            </button>

            {aberto && (
              <div className="lt-detalhe">
                {exec.entrada && (
                  <>
                    <p className="rotulo-mini">Entrada</p>
                    <pre className="preview">{JSON.stringify(exec.entrada, null, 2)}</pre>
                  </>
                )}
                {exec.saida && (
                  <>
                    <p className="rotulo-mini">Saída</p>
                    <pre className="preview">{JSON.stringify(exec.saida, null, 2)}</pre>
                  </>
                )}
                {exec.erro && (
                  <div className="aviso aviso--erro" style={{ marginTop: 'var(--sp-2)' }}>
                    <span>{exec.erro}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
