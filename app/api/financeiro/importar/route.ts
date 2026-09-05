import { createServerClient, getUsuarioAutenticado } from '@/lib/supabase/server'
import { verificarArea } from '@/lib/verificar-area'
import { verificarOrigem } from '@/lib/verificar-origem'
import { limparExtrato, limparTitulos } from '@/lib/financeiro/limpar'
import { casarLancamentos } from '@/lib/financeiro/casar'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Limite de tamanho do texto do extrato (~5MB de CSV cobre milhares de linhas)
const TAMANHO_MAXIMO = 5_000_000

export async function POST(req: NextRequest) {
  try {
    if (!verificarOrigem(req)) {
      return NextResponse.json({ erro: 'Origem não permitida' }, { status: 403 })
    }

    const user = await getUsuarioAutenticado()
    if (!user) {
      return NextResponse.json({ erro: 'Usuário não autenticado' }, { status: 401 })
    }
    await verificarArea(user.id, 'financeiro')

    const { nome_arquivo, texto_extrato, texto_titulos } = await req.json()

    if (!nome_arquivo || !texto_extrato) {
      return NextResponse.json(
        { erro: 'nome_arquivo e texto_extrato são obrigatórios' },
        { status: 400 }
      )
    }

    if (texto_extrato.length > TAMANHO_MAXIMO || (texto_titulos && texto_titulos.length > TAMANHO_MAXIMO)) {
      return NextResponse.json({ erro: 'Arquivo muito grande' }, { status: 400 })
    }

    const lancamentos = limparExtrato(texto_extrato)
    const supabase = createServerClient()

    // SPEC 5.3: se o usuário subiu títulos, usar esse arquivo; senão, usar titulos_receber
    let titulosParaCasar
    if (texto_titulos) {
      titulosParaCasar = limparTitulos(texto_titulos)
    } else {
      const { data: titulos } = await supabase
        .from('titulos_receber')
        .select('cod_titulo, cod_cliente, valor, vencimento, status, nota_fiscal')
      titulosParaCasar = (titulos || []).map((t: any) => ({
        cod_titulo: t.cod_titulo,
        cod_cliente: t.cod_cliente,
        valor: t.valor,
        vencimento: t.vencimento,
        status: t.status,
        nota_fiscal: t.nota_fiscal,
      }))
    }

    const { lancamentos: processados, divergencias } = casarLancamentos(lancamentos, titulosParaCasar)

    const { data: novoExtrato, error: erroExtrato } = await supabase
      .from('extratos_importados')
      .insert({
        nome_arquivo,
        importado_em: new Date().toISOString(),
        importado_por: user.id,
        total_linhas: lancamentos.length,
        total_creditos: lancamentos.filter((l) => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0),
      })
      .select()
      .single()

    if (erroExtrato || !novoExtrato) {
      throw new Error(erroExtrato?.message || 'Erro ao criar extrato')
    }

    const { data: lancamentosInseridos } = await supabase
      .from('lancamentos')
      .insert(
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
      .select()

    // `processados` e `lancamentosInseridos` estao na mesma ordem do insert;
    // `d.lancamento` e a mesma referencia de objeto que um item de `processados`,
    // entao achamos o indice pra ligar a divergencia ao lancamento gravado.
    await supabase.from('divergencias').insert(
      divergencias.map((d) => {
        const idx = processados.indexOf(d.lancamento)
        const lancamentoId = idx !== -1 ? lancamentosInseridos?.[idx]?.id : null
        return {
          extrato_id: novoExtrato.id,
          tipo_inicial: d.tipo_inicial,
          lancamento_id: lancamentoId || null,
          cod_titulo: d.cod_titulo || null,
          valor_lancamento: d.lancamento.valor,
          valor_titulo: d.valor_titulo ?? null,
          status: 'nova',
        }
      })
    )

    return NextResponse.json({ sucesso: true, extrato_id: novoExtrato.id })
  } catch (err) {
    console.error('Erro em importar extrato:', err)
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : 'Erro ao importar extrato' },
      { status: 403 }
    )
  }
}
