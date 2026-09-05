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
  const [respostaEditada, setRespostaEditada] = useState('')
  const [explicacaoEditada, setExplicacaoEditada] = useState('')
  const [valorABaixarEditado, setValorABaixarEditado] = useState('')
  const [valorPendenteEditado, setValorPendenteEditado] = useState('')
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
  const temResposta = typeof item?.proposta?.resposta === 'string'
  const triagemItens: any[] = item?.proposta?.triagem?.itens || []
  const itensNaoAtendidos: any[] = (item?.proposta?.contexto?.itens || [])
    .map((it: any, idx: number) => ({ ...it, descricao_cliente: triagemItens[idx]?.descricao_cliente }))
    .filter((it: any) => it.existe === false)

  const hipotese = item?.item_tipo === 'divergencia' ? item?.proposta?.hipotese : null
  const temHipotese = !!hipotese
  const confiancaBaixa = temHipotese && typeof hipotese.confianca === 'number' && hipotese.confianca < 0.6

  // Reflete a decisão no item de origem (SPEC 4.3 / 6.4 / 5.5).
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
    } else if (it.item_tipo === 'divergencia') {
      const divergenciaId = it.proposta?.divergencia_id
      if (divergenciaId) {
        await supabase
          .from('divergencias')
          .update({ status: decisao === 'aprovada' ? 'resolvida' : 'nova' })
          .eq('id', divergenciaId)
      }

      const hipotese = it.proposta?.hipotese
      if (decisao === 'aprovada' && hipotese?.cod_titulos_envolvidos?.length) {
        const status =
          hipotese.hipotese === 'vencido_sem_pagamento'
            ? 'vencido'
            : Number(hipotese.valor_pendente) > 0
              ? 'pago_parcial'
              : 'pago'
        await supabase
          .from('titulos_receber')
          .update({ status })
          .in('cod_titulo', hipotese.cod_titulos_envolvidos)
      }
    }
  }

  const aprovar = async (id: string, editada = false) => {
    if (!item) return
    setSalvando(true)
    const supabase = createClient()
    let propostaFinal = item.proposta
    const patch: Record<string, any> = {
      status: editada ? 'editada' : 'aprovada',
      decidido_por: usuarioId,
      decidido_em: new Date().toISOString(),
    }
    if (editada) {
      if (temResposta) {
        propostaFinal = { ...item.proposta, resposta: respostaEditada }
      } else if (temHipotese) {
        const valor_a_baixar = Number(valorABaixarEditado)
        const valor_pendente = Number(valorPendenteEditado)
        if (isNaN(valor_a_baixar) || isNaN(valor_pendente)) {
          alert('Valor a baixar e valor pendente precisam ser números válidos.')
          setSalvando(false)
          return
        }
        propostaFinal = {
          ...item.proposta,
          hipotese: {
            ...item.proposta.hipotese,
            explicacao: explicacaoEditada,
            valor_a_baixar,
            valor_pendente,
          },
        }
      } else {
        try {
          propostaFinal = JSON.parse(propostaEditada)
        } catch {
          alert('A proposta editada não é um JSON válido.')
          setSalvando(false)
          return
        }
      }
      patch.proposta = propostaFinal
    }
    const { error } = await supabase.from('aprovacoes').update(patch).eq('id', id)
    if (!error) {
      await aplicarDecisaoNoItem({ ...item, proposta: propostaFinal }, 'aprovada')
      setSelecionado(null)
      setPropostaEditada('')
      setRespostaEditada('')
      setExplicacaoEditada('')
      setValorABaixarEditado('')
      setValorPendenteEditado('')
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
      setPropostaEditada('')
      setRespostaEditada('')
      setExplicacaoEditada('')
      setValorABaixarEditado('')
      setValorPendenteEditado('')
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
              setRespostaEditada(typeof it.proposta?.resposta === 'string' ? it.proposta.resposta : '')
              const hip = it.item_tipo === 'divergencia' ? it.proposta?.hipotese : null
              setExplicacaoEditada(hip?.explicacao || '')
              setValorABaixarEditado(hip?.valor_a_baixar != null ? String(hip.valor_a_baixar) : '')
              setValorPendenteEditado(hip?.valor_pendente != null ? String(hip.valor_pendente) : '')
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

            {itensNaoAtendidos.length > 0 && (
              <div className="aviso aviso--erro" style={{ marginTop: 'var(--sp-4)' }}>
                <Icon type="alerta" size="sm" />
                <span>
                  <strong>Não vendemos:</strong>{' '}
                  {itensNaoAtendidos
                    .map((it) => it.descricao_cliente || it.descricao || it.cod_produto || 'item não identificado')
                    .join(', ')}{' '}
                  — confira a resposta antes de aprovar.
                </span>
              </div>
            )}

            {temResposta ? (
              <>
                <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
                  <label>Resposta ao cliente</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 240, whiteSpace: 'pre-wrap' }}
                    value={respostaEditada}
                    onChange={(e) => setRespostaEditada(e.target.value)}
                  />
                </div>

                <details style={{ marginTop: 'var(--sp-3)' }}>
                  <summary className="rotulo-mini" style={{ cursor: 'pointer' }}>
                    Dados completos (triagem, contexto, revisão)
                  </summary>
                  <pre className="preview" style={{ marginTop: 'var(--sp-2)' }}>{propostaEditada}</pre>
                </details>
              </>
            ) : temHipotese ? (
              <>
                {confiancaBaixa && (
                  <div className="aviso aviso--erro" style={{ marginTop: 'var(--sp-4)' }}>
                    <Icon type="alerta" size="sm" />
                    <span>
                      <strong>Confiança baixa</strong> ({Math.round(hipotese.confianca * 100)}%) — confira os dados antes de aprovar.
                    </span>
                  </div>
                )}

                <div className="fila-meta-grade" style={{ marginTop: 'var(--sp-4)' }}>
                  <div><span className="rotulo-mini">Hipótese</span><br />{hipotese.hipotese}</div>
                  <div><span className="rotulo-mini">Ação sugerida</span><br />{hipotese.acao_sugerida || '—'}</div>
                  <div><span className="rotulo-mini">Confiança</span><br />{hipotese.confianca != null ? `${Math.round(hipotese.confianca * 100)}%` : '—'}</div>
                  <div><span className="rotulo-mini">Títulos envolvidos</span><br />{(hipotese.cod_titulos_envolvidos || []).join(', ') || '—'}</div>
                </div>

                <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
                  <label>Explicação</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 140, whiteSpace: 'pre-wrap' }}
                    value={explicacaoEditada}
                    onChange={(e) => setExplicacaoEditada(e.target.value)}
                  />
                </div>

                <div className="form-grade" style={{ marginTop: 'var(--sp-4)' }}>
                  <div className="field">
                    <label>Valor a baixar (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={valorABaixarEditado}
                      onChange={(e) => setValorABaixarEditado(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Valor pendente (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={valorPendenteEditado}
                      onChange={(e) => setValorPendenteEditado(e.target.value)}
                    />
                  </div>
                </div>

                <details style={{ marginTop: 'var(--sp-3)' }}>
                  <summary className="rotulo-mini" style={{ cursor: 'pointer' }}>
                    Dados completos (relatório, revisão)
                  </summary>
                  <pre className="preview" style={{ marginTop: 'var(--sp-2)' }}>{propostaEditada}</pre>
                </details>
              </>
            ) : (
              <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
                <label>Proposta</label>
                <textarea
                  className="input"
                  style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }}
                  value={propostaEditada}
                  onChange={(e) => setPropostaEditada(e.target.value)}
                />
              </div>
            )}

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
