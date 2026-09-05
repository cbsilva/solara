'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { limparExtrato } from '@/lib/financeiro/limpar'

interface Lancamento {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Mesmo limite aplicado na rota /api/financeiro/importar
const TAMANHO_MAXIMO_ARQUIVO = 5_000_000

// SPEC 5.3: ler latin-1 se utf-8 falhar. File.text() sempre decodifica como
// utf-8; lemos como bytes e decodificamos manualmente para poder tentar de novo.
async function lerArquivoTexto(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (utf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer)
  }
  return utf8
}

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

      // Retoma o ultimo extrato importado, ja que extratoId so vive no estado
      // do componente e some ao sair/voltar da tela.
      const { data: ultimoExtrato } = await supabase
        .from('extratos_importados')
        .select('id')
        .order('importado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ultimoExtrato) setExtratoId(ultimoExtrato.id)

      setCarregando(false)
    }
    verificar()
  }, [router])

  const uploadExtrato = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      alert('Arquivo muito grande (máximo 5MB).')
      e.target.value = ''
      return
    }
    setArquivoExtrato(file)
    const texto = await lerArquivoTexto(file)
    setLinhasAntes(texto.split('\n').slice(0, 6))
    try {
      setLinhasDepois(limparExtrato(texto).slice(0, 6))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    }
  }

  // Limpeza, casamento e gravação agora rodam em /api/financeiro/importar
  // (servidor), não mais direto do navegador com a chave publicável.
  const conciliar = async () => {
    if (!arquivoExtrato) {
      alert('Selecione o arquivo de extrato')
      return
    }
    if (arquivoTitulos && arquivoTitulos.size > TAMANHO_MAXIMO_ARQUIVO) {
      alert('Arquivo de títulos muito grande (máximo 5MB).')
      return
    }
    setConciliando(true)
    try {
      const texto_extrato = await lerArquivoTexto(arquivoExtrato)
      const texto_titulos = arquivoTitulos ? await lerArquivoTexto(arquivoTitulos) : undefined

      const res = await fetch('/api/financeiro/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_arquivo: arquivoExtrato.name,
          texto_extrato,
          texto_titulos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erro || 'Erro ao conciliar')

      setExtratoId(data.extrato_id)
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

const DIVERGENCIA_COLUNAS = ['nova', 'investigando', 'aguardando_aprovacao', 'resolvida'] as const

const DIVERGENCIA_META: Record<string, { rotulo: string; ponto: string }> = {
  nova: { rotulo: 'Nova', ponto: 'var(--info)' },
  investigando: { rotulo: 'Investigando', ponto: 'var(--warning)' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', ponto: 'var(--accent)' },
  resolvida: { rotulo: 'Resolvida', ponto: 'var(--success)' },
}

function ResultadoLancamentos({ extrato_id }: { extrato_id: string }) {
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [divergencias, setDivergencias] = useState<any[]>([])
  const [processando, setProcessando] = useState(false)

  const buscar = async () => {
    const supabase = createClient()
    const { data: l } = await supabase.from('lancamentos').select().eq('extrato_id', extrato_id)
    const { data: d } = await supabase.from('divergencias').select().eq('extrato_id', extrato_id)
    setLancamentos(l || [])
    setDivergencias(d || [])
  }

  useEffect(() => {
    buscar()

    const supabase = createClient()
    const canal = supabase
      .channel(`divergencias-${extrato_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'divergencias', filter: `extrato_id=eq.${extrato_id}` },
        () => buscar()
      )
      .subscribe()
    return () => { canal.unsubscribe() }
  }, [extrato_id])

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const ignorados = lancamentos.filter((l) => l.situacao === 'ignorado')
  const porStatus = DIVERGENCIA_COLUNAS.reduce((acc, s) => {
    acc[s] = divergencias.filter((d) => d.status === s)
    return acc
  }, {} as Record<string, any[]>)

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <div className="resultado-grade" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
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
            <span className="badge badge--neutral">Ignorados · {ignorados.length}</span>
            <p className="resultado-valor" style={{ color: 'var(--text-faint)' }}>
              {brl(ignorados.reduce((s, l) => s + l.valor, 0))}
            </p>
            <p className="app-subtitulo">Débitos não processados na conciliação.</p>
          </div>
        </div>
      </div>

      <div>
        <div className="tela-cabecalho" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3>Divergências</h3>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={investigar}
            disabled={processando || porStatus.nova.length === 0}
          >
            {processando ? <span className="spinner" /> : <Icon type="assistente" size="sm" />}
            {processando ? 'Investigando…' : `Investigar ${porStatus.nova.length || ''}`.trim()}
          </button>
        </div>

        <div className="kanban">
          {DIVERGENCIA_COLUNAS.map((status) => (
            <div key={status} className="coluna">
              <div className="coluna-head">
                <span className="ponto" style={{ background: DIVERGENCIA_META[status].ponto }} />
                {DIVERGENCIA_META[status].rotulo}
                <span className="conta">{porStatus[status].length}</span>
              </div>

              {porStatus[status].map((d) => (
                <div key={d.id} className="cartao">
                  <div className="cartao-codigo">{d.tipo_inicial || 'divergência'}</div>
                  {d.cod_titulo && <div className="cartao-linha">Título {d.cod_titulo}</div>}
                  <div className="cartao-linha">{brl(d.valor_lancamento || 0)}</div>
                </div>
              ))}

              {porStatus[status].length === 0 && (
                <p className="estado-vazio" style={{ padding: 'var(--sp-6) 0' }}>Nenhuma</p>
              )}
            </div>
          ))}
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
