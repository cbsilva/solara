'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { limparExtrato } from '@/lib/financeiro/limpar'
import { casarLancamentos } from '@/lib/financeiro/casar'

interface Lancamento {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

export default function FinanceiroPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [perfil, setPerfil] = useState<{ areas: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'importar' | 'resultado' | 'relatorio' | 'aprovacoes'>('importar')

  // Upload
  const [arquivoExtrato, setArquivoExtrato] = useState<File | null>(null)
  const [arquivoTitulos, setArquivoTitulos] = useState<File | null>(null)
  const [linhasAntes, setLinhasAntes] = useState<string[]>([])
  const [linhasDepois, setLinhasDepois] = useState<Lancamento[]>([])
  const [conciliando, setConciliando] = useState(false)
  const [extratoId, setExtratoId] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser({ id: session.user.id, email: session.user.email || '' })

      // Verificar permissão
      const { data: perfilData } = await supabase
        .from('perfis')
        .select()
        .eq('id', session.user.id)
        .single()

      if (!perfilData?.areas?.includes('financeiro')) {
        router.push('/')
        return
      }

      setPerfil(perfilData)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  const handleUploadExtrato = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoExtrato(file)

    // Ler e processar arquivo
    const texto = await file.text()
    const linhas = texto.split('\n').slice(0, 6)
    setLinhasAntes(linhas)

    try {
      const lancamentos = limparExtrato(texto)
      setLinhasDepois(lancamentos.slice(0, 6))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao processar arquivo')
    }
  }

  const handleConciliar = async () => {
    if (!arquivoExtrato) {
      alert('Selecione o arquivo de extrato')
      return
    }

    setConciliando(true)

    try {
      // 1. Upload e limpeza
      const texto = await arquivoExtrato.text()
      const lancamentos = limparExtrato(texto)

      // 2. Buscar títulos
      const supabase = createClient()
      const { data: titulos } = await supabase
        .from('titulos_receber')
        .select('cod_titulo, valor, vencimento, status, nota_fiscal')

      // 3. Casar
      const { lancamentos: lancamentosProcessados, divergencias } = casarLancamentos(
        lancamentos,
        titulos?.map((t: any) => ({
          cod_titulo: t.cod_titulo,
          valor: t.valor,
          vencimento: t.vencimento,
          status: t.status,
          nota_fiscal: t.nota_fiscal,
        })) || []
      )

      // 4. Salvar no Supabase
      const { data: novoExtrato } = await supabase
        .from('extratos_importados')
        .insert({
          nome_arquivo: arquivoExtrato.name,
          importado_em: new Date().toISOString(),
          importado_por: user?.id,
          total_linhas: lancamentos.length,
          total_creditos: lancamentos
            .filter((l) => l.tipo === 'credito')
            .reduce((sum, l) => sum + l.valor, 0),
        })
        .select()
        .single()

      if (!novoExtrato) throw new Error('Erro ao criar extrato')

      // 5. Inserir lançamentos
      const lancamentosParaSalvar = lancamentosProcessados.map((l) => ({
        extrato_id: novoExtrato.id,
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        cod_titulo_casado: l.cod_titulo_casado || null,
        situacao: l.situacao,
      }))

      await supabase.from('lancamentos').insert(lancamentosParaSalvar)

      // 6. Inserir divergências
      const divergenciasParaSalvar = divergencias.map((d) => ({
        extrato_id: novoExtrato.id,
        tipo_inicial: d.tipo_inicial,
        lancamento_id: null,
        cod_titulo: d.cod_titulo || null,
        valor_lancamento: d.lancamento.valor,
        valor_titulo: null,
        status: 'nova',
      }))

      await supabase.from('divergencias').insert(divergenciasParaSalvar)

      setExtratoId(novoExtrato.id)
      setAba('resultado')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao conciliar')
    } finally {
      setConciliando(false)
    }
  }

  if (loading) return <div style={{ padding: '20px' }}>Carregando...</div>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: 0 }}>Financeiro</h2>
        </div>
      </div>

      {/* Organograma */}
      {extratoId && (
        <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '15px 20px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', minHeight: '100px' }}>
            <Organograma area="financeiro" item_id={extratoId} />
          </div>
        </div>
      )}

      {/* Abas */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #eee', padding: '0 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '20px' }}>
          {['importar', 'resultado', 'relatorio', 'aprovacoes'].map((t) => (
            <button
              key={t}
              onClick={() => setAba(t as any)}
              style={{
                padding: '12px 20px',
                backgroundColor: aba === t ? '#1976d2' : 'transparent',
                color: aba === t ? 'white' : '#333',
                border: 'none',
                borderBottom: aba === t ? '3px solid #1976d2' : 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {aba === 'importar' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
              {/* Upload */}
              <div>
                <h3>Upload de Extrato</h3>
                <div
                  style={{
                    border: '2px dashed #1976d2',
                    borderRadius: '8px',
                    padding: '40px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => document.getElementById('fileExtrato')?.click()}
                >
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📄</div>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                    {arquivoExtrato?.name || 'Clique para selecionar extrato'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>CSV do banco</div>
                  <input
                    id="fileExtrato"
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleUploadExtrato}
                    style={{ display: 'none' }}
                  />
                </div>

                <h3 style={{ marginTop: '20px' }}>Upload de Títulos (opcional)</h3>
                <div
                  style={{
                    border: '2px dashed #999',
                    borderRadius: '8px',
                    padding: '40px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => document.getElementById('fileTitulos')?.click()}
                >
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                    {arquivoTitulos?.name || 'Clique para selecionar títulos'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>CSV de títulos</div>
                  <input
                    id="fileTitulos"
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => setArquivoTitulos(e.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                  />
                </div>

                <button
                  onClick={handleConciliar}
                  disabled={!arquivoExtrato || conciliando}
                  style={{
                    marginTop: '20px',
                    width: '100%',
                    padding: '12px',
                    backgroundColor: conciliando || !arquivoExtrato ? '#ccc' : '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: conciliando || !arquivoExtrato ? 'default' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {conciliando ? 'Conciliando...' : 'Conciliar'}
                </button>
              </div>

              {/* Preview */}
              <div>
                <h3>Antes e Depois</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Arquivo Original</div>
                    <div
                      style={{
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        maxHeight: '400px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {linhasAntes.join('\n')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Normalizado</div>
                    <div
                      style={{
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        maxHeight: '400px',
                        overflow: 'auto',
                      }}
                    >
                      {linhasDepois.map((l, i) => (
                        <div key={i}>
                          {l.data} | {l.descricao.substring(0, 20)} | {l.valor.toFixed(2)} | {l.tipo}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {aba === 'resultado' && extratoId && (
          <ResultadoLancamentos extrato_id={extratoId} />
        )}

        {aba === 'relatorio' && extratoId && (
          <RelatorioConciliacao extrato_id={extratoId} />
        )}

        {aba === 'aprovacoes' && user && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', height: '600px' }}>
            <FilaAprovacao area="financeiro" usuarioId={user.id} />
          </div>
        )}
      </div>
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
      const { data: l } = await supabase
        .from('lancamentos')
        .select()
        .eq('extrato_id', extrato_id)
      const { data: d } = await supabase
        .from('divergencias')
        .select()
        .eq('extrato_id', extrato_id)

      setLancamentos(l || [])
      setDivergencias(d || [])
    }

    buscar()
  }, [extrato_id])

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const divergentes = divergencias.filter((d) => d.status !== 'resolvida')
  const ignorados = lancamentos.filter((l) => l.situacao === 'ignorado')

  const handleProcessar = async () => {
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
      {/* Casados */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', borderLeft: '4px solid #4caf50' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#4caf50' }}>Casados ({casados.length})</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4caf50' }}>
          R$ {casados.reduce((sum, l) => sum + l.valor, 0).toFixed(2)}
        </div>
        <div style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
          {casados.map((l) => (
            <div key={l.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
              {l.data} • {l.descricao.substring(0, 30)} • R$ {l.valor.toFixed(2)}
            </div>
          ))}
        </div>
      </div>

      {/* Divergências */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', borderLeft: '4px solid #ff9800' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#ff9800' }}>Divergências ({divergentes.length})</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
          R$ {divergentes.reduce((sum, d) => sum + (d.valor_lancamento || 0), 0).toFixed(2)}
        </div>
        <button
          onClick={handleProcessar}
          disabled={processando || divergentes.length === 0}
          style={{
            marginTop: '10px',
            width: '100%',
            padding: '8px',
            backgroundColor: processando || divergentes.length === 0 ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: processando || divergentes.length === 0 ? 'default' : 'pointer',
          }}
        >
          {processando ? 'Investigando...' : 'Investigar'}
        </button>
        <div style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
          {divergentes.map((d) => (
            <div key={d.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
              {d.tipo_inicial} • R$ {d.valor_lancamento?.toFixed(2)}
            </div>
          ))}
        </div>
      </div>

      {/* Ignorados */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', borderLeft: '4px solid #999' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#999' }}>Ignorados ({ignorados.length})</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#999' }}>
          R$ {ignorados.reduce((sum, l) => sum + l.valor, 0).toFixed(2)}
        </div>
        <div style={{ fontSize: '12px', color: '#ccc', marginTop: '10px' }}>
          Débitos não processados
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
      const { data: aprovacoes } = await supabase
        .from('aprovacoes')
        .select()
        .eq('item_id', extrato_id)
        .eq('area', 'financeiro')
        .limit(1)

      if (aprovacoes?.[0]?.proposta?.relatorio) {
        setRelatorio(aprovacoes[0].proposta.relatorio)
      }
    }

    buscar()
  }, [extrato_id])

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px' }}>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          color: '#333',
        }}
      >
        {relatorio || 'Relatório será gerado após investigação...'}
      </div>
    </div>
  )
}
