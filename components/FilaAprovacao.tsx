'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/Icon'

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

const BADGE: Record<string, string> = {
  pendente: 'badge--warning',
  aprovada: 'badge--success',
  editada: 'badge--info',
  rejeitada: 'badge--danger',
}

export function FilaAprovacao({ area, usuarioId }: { area: string; usuarioId: string }) {
  const [itens, setItens] = useState<Aprovacao[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [propostaEditada, setPropostaEditada] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [soPendentes, setSoPendentes] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const buscar = async () => {
      let query = supabase.from('aprovacoes').select().eq('area', area)
      if (soPendentes) query = query.eq('status', 'pendente')
      const { data } = await query.order('created_at', { ascending: true })
      if (data) setItens(data as Aprovacao[])
    }

    buscar()

    const canal = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aprovacoes', filter: `area=eq.${area}` },
        () => buscar()
      )
      .subscribe()

    return () => {
      canal.unsubscribe()
    }
  }, [area, soPendentes])

  const item = selecionado ? itens.find((i) => i.id === selecionado) : null

  // Reflete a decisão no item de origem (SPEC 4.3 / 6.4). 1:1 apenas para
  // `pedido` e `faixa`; `divergencia` fica a cargo do fluxo de Financeiro.
  const aplicarDecisaoNoItem = async (it: Aprovacao, decisao: 'aprovada' | 'rejeitada') => {
    const supabase = createClient()
    if (it.item_tipo === 'pedido') {
      await supabase
        .from('pedidos_orcamento')
        .update({ status: decisao === 'aprovada' ? 'respondido' : 'rejeitado' })
        .eq('cod_pedido', it.item_id)
    } else if (it.item_tipo === 'faixa') {
      await supabase
        .from('faixas_salariais')
        .update(
          decisao === 'aprovada'
            ? { status: 'aprovada', inicio: new Date().toISOString().slice(0, 10) }
            : { status: 'rejeitada' }
        )
        .eq('id_faixa', it.item_id)
    }
  }

  const aprovar = async (id: string, editada = false) => {
    if (!item) return
    setSalvando(true)
    const supabase = createClient()
    const patch: Record<string, any> = {
      status: editada ? 'editada' : 'aprovada',
      decidido_por: usuarioId,
      decidido_em: new Date().toISOString(),
    }
    if (editada) {
      try {
        patch.proposta = JSON.parse(propostaEditada)
      } catch {
        alert('A proposta editada não é um JSON válido.')
        setSalvando(false)
        return
      }
    }
    const { error } = await supabase.from('aprovacoes').update(patch).eq('id', id)
    if (!error) {
      await aplicarDecisaoNoItem(item, 'aprovada')
      setSelecionado(null)
      setPropostaEditada('')
    }
    setSalvando(false)
  }

  const rejeitar = async (id: string) => {
    if (!item) return
    if (!observacao.trim()) {
      alert('Adicione uma observação ao rejeitar.')
      return
    }
    setSalvando(true)
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
      await aplicarDecisaoNoItem(item, 'rejeitada')
      setSelecionado(null)
      setObservacao('')
    }
    setSalvando(false)
  }

  return (
    <div className="fila">
      {/* Lista */}
      <div className="fila-lista">
        <label className="ctl fila-filtro">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Apenas pendentes
        </label>

        {itens.length === 0 && <p className="estado-vazio">Nenhum item</p>}

        {itens.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`fila-item ${selecionado === it.id ? 'is-selected' : ''}`}
            onClick={() => {
              setSelecionado(it.id)
              setPropostaEditada(JSON.stringify(it.proposta, null, 2))
              setObservacao('')
            }}
          >
            <span className="fila-item-titulo">{it.titulo}</span>
            <span className="fila-item-meta">{it.item_tipo} · {it.item_id}</span>
            <span className={`badge ${BADGE[it.status] || 'badge--neutral'}`}>{it.status}</span>
          </button>
        ))}
      </div>

      {/* Detalhe */}
      <div className="fila-detalhe">
        {!item ? (
          <p className="estado-vazio">Selecione um item para revisar.</p>
        ) : (
          <>
            <h3>{item.titulo}</h3>

            <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
              <label>Proposta</label>
              <textarea
                className="input"
                style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}
                value={propostaEditada}
                onChange={(e) => setPropostaEditada(e.target.value)}
              />
            </div>

            {item.status === 'pendente' ? (
              <>
                <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
                  <label>Observação (obrigatória ao rejeitar)</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 90 }}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Explique o motivo…"
                  />
                </div>

                <div className="fila-acoes">
                  <button className="btn btn--primary" disabled={salvando} onClick={() => aprovar(item.id, false)}>
                    <Icon type="check" size="sm" />
                    Aprovar
                  </button>
                  <button className="btn btn--secondary" disabled={salvando} onClick={() => aprovar(item.id, true)}>
                    Salvar edição e aprovar
                  </button>
                  <button className="btn btn--danger" disabled={salvando} onClick={() => rejeitar(item.id)}>
                    <Icon type="fechar" size="sm" />
                    Rejeitar
                  </button>
                </div>
              </>
            ) : (
              <div className="aviso" style={{ marginTop: 'var(--sp-4)' }}>
                <div>
                  <div><strong>Status:</strong> {item.status}</div>
                  {item.decidido_em && (
                    <div><strong>Decidido em:</strong> {new Date(item.decidido_em).toLocaleString('pt-BR')}</div>
                  )}
                  {item.observacao && (
                    <div style={{ marginTop: 'var(--sp-2)', whiteSpace: 'pre-wrap' }}>
                      <strong>Observação:</strong> {item.observacao}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
