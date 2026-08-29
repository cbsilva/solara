'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { limparExtrato } from '@/lib/financeiro/limpar'
import { casarLancamentos } from '@/lib/financeiro/casar'

interface Lancamento {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FinanceiroPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'importar' | 'resultado' | 'relatorio' | 'aprovacoes'>('importar')

  const [arquivoExtrato, setArquivoExtrato] = useState<File | null>(null)
  const [arquivoTitulos, setArquivoTitulos] = useState<File | null>(null)
  const [linhasAntes, setLinhasAntes] = useState<string[]>([])
  const [linhasDepois, setLinhasDepois] = useState<Lancamento[]>([])
  const [conciliando, setConciliando] = useState(false)
  const [extratoId, setExtratoId] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const verificar = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({ id: session.user.id, email: session.user.email || '' })

      const { data: perfil } = await supabase.from('perfis').select().eq('id', session.user.id).single()
      if (!perfil?.areas?.includes('financeiro')) {
        router.push('/')
        return
      }
      setCarregando(false)
    }
    verificar()
  }, [router])

  const uploadExtrato = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivoExtrato(file)
    const texto = await file.text()
    setLinhasAntes(texto.split('\n').slice(0, 6))
    try {
      setLinhasDepois(limparExtrato(texto).slice(0, 6))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    }
  }

  const conciliar = async () => {
    if (!arquivoExtrato) {
      alert('Selecione o arquivo de extrato')
      return
    }
    setConciliando(true)
    try {
      const texto = await arquivoExtrato.text()
      const lancamentos = limparExtrato(texto)

      const supabase = createClient()
      const { data: titulos } = await supabase
        .from('titulos_receber')
        .select('cod_titulo, cod_cliente, valor, vencimento, status, nota_fiscal')

      const { lancamentos: processados, divergencias } = casarLancamentos(
        lancamentos,
        titulos?.map((t: any) => ({
          cod_titulo: t.cod_titulo,
          cod_cliente: t.cod_cliente,
          valor: t.valor,
          vencimento: t.vencimento,
          status: t.status,
          nota_fiscal: t.nota_fiscal,
        })) || []
      )

      const { data: novoExtrato } = await supabase
        .from('extratos_importados')
        .insert({
          nome_arquivo: arquivoExtrato.name,
          importado_em: new Date().toISOString(),
          importado_por: user?.id,
          total_linhas: lancamentos.length,
          total_creditos: lancamentos.filter((l) => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0),
        })
        .select()
        .single()

      if (!novoExtrato) throw new Error('Erro ao criar extrato')

      await supabase.from('lancamentos').insert(
        processados.map((l) => ({
          extrato_id: novoExtrato.id,
          data: l.data,
          descricao: l.descricao,
          valor: l.valor,
          tipo: l.tipo,
          cod_titulo_casado: l.cod_titulo_casado || null,
          situacao: l.situacao,
        }))
      )

      await supabase.from('divergencias').insert(
        divergencias.map((d) => ({
          extrato_id: novoExtrato.id,
          tipo_inicial: d.tipo_inicial,
          lancamento_id: null,
          cod_titulo: d.cod_titulo || null,
          valor_lancamento: d.lancamento.valor,
          valor_titulo: null,
          status: 'nova',
        }))
      )

      setExtratoId(novoExtrato.id)
      setAba('resultado')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao conciliar')
    } finally {
      setConciliando(false)
    }
  }

  if (carregando) {
    return (
      <div className="carregando-tela">
        <span className="spinner spinner--lg" />
        <p>Carregando…</p>
      </div>
    )
  }

  const abas = [
    { id: 'importar', rotulo: 'Importar', icone: 'upload' as const },
    { id: 'resultado', rotulo: 'Resultado', icone: 'painel' as const },
    { id: 'relatorio', rotulo: 'Relatório', icone: 'cotacoes' as const },
    { id: 'aprovacoes', rotulo: 'Aprovações', icone: 'check-duplo' as const },
  ]

  return (
    <div className="pagina-app">
      <Header contexto="Financeiro · Conciliação" usuarioEmail={user?.email} mostraInicio mostraLogout />

      <main className="app-main">
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <h1 className="app-titulo">Conciliação bancária</h1>
          <p className="app-subtitulo">Importe o extrato, concilie e investigue as divergências.</p>
        </div>

        {extratoId && (
          <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
            <div className="card-head">
              <Icon type="assistente" size="md" />
              Execução da conciliação
            </div>
            <div className="card-body">
              <Organograma area="financeiro" item_id={extratoId} />
            </div>
          </div>
        )}

        <div className="tabs" style={{ marginBottom: 'var(--sp-5)' }}>
          {abas.map((t) => (
            <button
              key={t.id}
              className={`tab ${aba === t.id ? 'is-ativo' : ''}`}
              onClick={() => setAba(t.id as typeof aba)}
            >
              <Icon type={t.icone} size="sm" />
              {t.rotulo}
            </button>
          ))}
        </div>

        {aba === 'importar' && (
          <div className="importar-grade">
            <div className="card">
              <div className="card-head">Arquivos</div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                <div>
                  <label className="dropzone" htmlFor="fileExtrato">
                    <Icon type="upload" size="lg" />
                    <strong>{arquivoExtrato?.name || 'Selecionar extrato'}</strong>
                    <span>CSV do banco (obrigatório)</span>
                    <input id="fileExtrato" type="file" accept=".csv,.txt" onChange={uploadExtrato} hidden />
                  </label>
                </div>

                <div>
                  <label className="dropzone dropzone--opcional" htmlFor="fileTitulos">
                    <Icon type="upload" size="lg" />
                    <strong>{arquivoTitulos?.name || 'Selecionar títulos'}</strong>
                    <span>CSV de títulos (opcional)</span>
                    <input
                      id="fileTitulos"
                      type="file"
                      accept=".csv,.txt"
                      onChange={(e) => setArquivoTitulos(e.target.files?.[0] || null)}
                      hidden
                    />
                  </label>
                </div>
              </div>
              <div className="card-foot">
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={conciliar}
                  disabled={!arquivoExtrato || conciliando}
                >
                  {conciliando ? <span className="spinner" /> : <Icon type="raio" size="sm" />}
                  {conciliando ? 'Conciliando…' : 'Conciliar'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-head">Antes e depois</div>
              <div className="card-body">
                <div className="antes-depois">
                  <div>
                    <p className="rotulo-mini">Arquivo original</p>
                    <pre className="preview">{linhasAntes.join('\n') || '—'}</pre>
                  </div>
                  <div>
                    <p className="rotulo-mini">Normalizado</p>
                    <pre className="preview">
                      {linhasDepois.length === 0
                        ? '—'
                        : linhasDepois
                            .map((l) => `${l.data}  ${l.descricao.slice(0, 22).padEnd(22)}  ${l.valor.toFixed(2)}  ${l.tipo}`)
                            .join('\n')}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {aba === 'resultado' && extratoId && <ResultadoLancamentos extrato_id={extratoId} />}
        {aba === 'resultado' && !extratoId && <p className="estado-vazio">Importe e concilie um extrato primeiro.</p>}

        {aba === 'relatorio' && extratoId && <RelatorioConciliacao extrato_id={extratoId} />}
        {aba === 'relatorio' && !extratoId && <p className="estado-vazio">O relatório aparece após a investigação.</p>}

        {aba === 'aprovacoes' && user && (
          <div className="card" style={{ height: 620, overflow: 'hidden' }}>
            <FilaAprovacao area="financeiro" usuarioId={user.id} />
          </div>
        )}
      </main>
    </div>
  )
}

function ResultadoLancamentos({ extrato_id }: { extrato_id: string }) {
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [divergencias, setDivergencias] = useState<any[]>([])
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    const buscar = async () => {
      const supabase = createClient()
      const { data: l } = await supabase.from('lancamentos').select().eq('extrato_id', extrato_id)
      const { data: d } = await supabase.from('divergencias').select().eq('extrato_id', extrato_id)
      setLancamentos(l || [])
      setDivergencias(d || [])
    }
    buscar()
  }, [extrato_id])

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const divergentes = divergencias.filter((d) => d.status !== 'resolvida')
  const ignorados = lancamentos.filter((l) => l.situacao === 'ignorado')

  const investigar = async () => {
    setProcessando(true)
    try {
      const res = await fetch('/api/financeiro/conciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extrato_id }),
      })
      if (!res.ok) throw new Error('Erro ao processar')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="resultado-grade">
      <div className="card resultado-card">
        <div className="card-body">
          <span className="badge badge--success">Bateram · {casados.length}</span>
          <p className="resultado-valor" style={{ color: 'var(--success-text)' }}>
            {brl(casados.reduce((s, l) => s + l.valor, 0))}
          </p>
          <ul className="resultado-lista">
            {casados.map((l) => (
              <li key={l.id}>
                <span>{l.data} · {l.descricao.slice(0, 28)}</span>
                <span className="num">{brl(l.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card resultado-card">
        <div className="card-body">
          <span className="badge badge--warning">Divergências · {divergentes.length}</span>
          <p className="resultado-valor" style={{ color: 'var(--warning-text)' }}>
            {brl(divergentes.reduce((s, d) => s + (d.valor_lancamento || 0), 0))}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm btn--block"
            onClick={investigar}
            disabled={processando || divergentes.length === 0}
          >
            {processando ? <span className="spinner" /> : <Icon type="assistente" size="sm" />}
            {processando ? 'Investigando…' : 'Investigar'}
          </button>
          <ul className="resultado-lista">
            {divergentes.map((d) => (
              <li key={d.id}>
                <span>{d.tipo_inicial}</span>
                <span className="num">{brl(d.valor_lancamento || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card resultado-card">
        <div className="card-body">
          <span className="badge badge--neutral">Ignorados · {ignorados.length}</span>
          <p className="resultado-valor" style={{ color: 'var(--text-faint)' }}>
            {brl(ignorados.reduce((s, l) => s + l.valor, 0))}
          </p>
          <p className="app-subtitulo">Débitos não processados na conciliação.</p>
        </div>
      </div>
    </div>
  )
}

function RelatorioConciliacao({ extrato_id }: { extrato_id: string }) {
  const [relatorio, setRelatorio] = useState('')

  useEffect(() => {
    const buscar = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('aprovacoes')
        .select()
        .eq('item_id', extrato_id)
        .eq('area', 'financeiro')
        .limit(1)
      if (data?.[0]?.proposta?.relatorio) setRelatorio(data[0].proposta.relatorio)
    }
    buscar()
  }, [extrato_id])

  return (
    <div className="card">
      <div className="card-body">
        <pre className="preview" style={{ maxHeight: 'none' }}>
          {relatorio || 'Relatório será gerado após a investigação das divergências.'}
        </pre>
      </div>
    </div>
  )
}
