export interface Lancamento {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  cod_titulo_casado?: string
  situacao: 'casado' | 'divergente' | 'ignorado'
  tipo_inicial?: string
}

export interface Titulo {
  cod_titulo: string
  cod_cliente: string
  valor: number
  vencimento: string // YYYY-MM-DD
  status: string // 'aberto' | 'pago' | 'cancelado' | ... (dado externo, nao confiar em union estrita)
  nota_fiscal?: string
}

export interface ResultadoCasamento {
  lancamentos: Lancamento[]
  divergencias: {
    lancamento: Lancamento
    tipo_inicial: string
    cod_titulo?: string
    valor_titulo?: number
  }[]
}

type LancamentoBruto = { data: string; descricao: string; valor: number; tipo: 'credito' | 'debito' }

export function casarLancamentos(
  lancamentos: LancamentoBruto[],
  titulos: Titulo[]
): ResultadoCasamento {
  const lancamentosProcessados: Lancamento[] = []
  const divergencias: ResultadoCasamento['divergencias'] = []

  const titulosAbertos = titulos.filter((t) => t.status === 'aberto')
  // Titulos ja reivindicados por um lancamento anterior nesta mesma rodada
  const claimados = new Set<string>()

  for (const lancamento of lancamentos) {
    if (lancamento.tipo === 'debito') {
      lancamentosProcessados.push({ ...lancamento, situacao: 'ignorado' })
      continue
    }

    const resultado = casarCredito(lancamento, titulosAbertos, claimados)
    lancamentosProcessados.push(resultado.lancamento)

    if (resultado.situacao === 'casado' && resultado.cod_titulo) {
      claimados.add(resultado.cod_titulo)
    } else {
      divergencias.push({
        lancamento: resultado.lancamento,
        tipo_inicial: resultado.tipo_inicial!,
        cod_titulo: resultado.cod_titulo,
        valor_titulo: resultado.valor_titulo,
      })
    }
  }

  // Titulos em aberto (nao reivindicados) com vencimento anterior a data final
  // do extrato viram divergencia "vencido_sem_pagamento"
  const datasCasadas = lancamentosProcessados
    .filter((l) => l.situacao === 'casado')
    .map((l) => new Date(l.data).getTime())
  const dataFinal = datasCasadas.length > 0 ? new Date(Math.max(...datasCasadas)) : new Date()

  for (const titulo of titulosAbertos) {
    if (claimados.has(titulo.cod_titulo)) continue
    if (new Date(titulo.vencimento) < dataFinal) {
      divergencias.push({
        lancamento: {
          data: titulo.vencimento,
          descricao: `Vencido sem pagamento: ${titulo.cod_titulo}`,
          valor: titulo.valor,
          tipo: 'credito',
          situacao: 'divergente',
          tipo_inicial: 'vencido_sem_pagamento',
        },
        tipo_inicial: 'vencido_sem_pagamento',
        cod_titulo: titulo.cod_titulo,
        valor_titulo: titulo.valor,
      })
    }
  }

  return { lancamentos: lancamentosProcessados, divergencias }
}

function diasEntre(dataA: string, dataB: string): number {
  return Math.abs(
    Math.floor((new Date(dataA).getTime() - new Date(dataB).getTime()) / (1000 * 60 * 60 * 24))
  )
}

function casado(lancamento: LancamentoBruto, cod_titulo: string) {
  return {
    lancamento: { ...lancamento, cod_titulo_casado: cod_titulo, situacao: 'casado' as const },
    situacao: 'casado' as const,
    cod_titulo,
  }
}

function divergente(
  lancamento: LancamentoBruto,
  tipo_inicial: string,
  cod_titulo?: string,
  valor_titulo?: number
) {
  return {
    lancamento: { ...lancamento, situacao: 'divergente' as const, tipo_inicial },
    tipo_inicial,
    situacao: 'divergente' as const,
    cod_titulo,
    valor_titulo,
  }
}

function casarCredito(
  lancamento: LancamentoBruto,
  titulosAbertos: Titulo[],
  claimados: Set<string>
): {
  lancamento: Lancamento
  tipo_inicial?: string
  situacao: 'casado' | 'divergente'
  cod_titulo?: string
  valor_titulo?: number
} {
  const disponiveis = titulosAbertos.filter((t) => !claimados.has(t.cod_titulo))

  // 1. Descricao contem NF-<n> e existe titulo com essa nota
  const matchNF = lancamento.descricao.match(/NF-?(\d+)/i)
  if (matchNF) {
    const nf = matchNF[1]
    const tituloNF = titulosAbertos.find((t) => t.nota_fiscal && t.nota_fiscal.includes(nf))
    if (tituloNF) {
      if (claimados.has(tituloNF.cod_titulo)) {
        return divergente(lancamento, 'duplicado', tituloNF.cod_titulo, tituloNF.valor)
      }
      if (Math.abs(tituloNF.valor - lancamento.valor) < 0.01) {
        return casado(lancamento, tituloNF.cod_titulo)
      }
      return divergente(lancamento, 'valor_diferente_mesma_nf', tituloNF.cod_titulo, tituloNF.valor)
    }
    // NF mencionada mas nenhum titulo com essa nota — segue para as proximas regras
  }

  // 2. Titulo unico em aberto com mesmo valor e vencimento a ate 5 dias
  const porValor = disponiveis.filter((t) => Math.abs(t.valor - lancamento.valor) < 0.01)
  const porValorEData = porValor.filter((t) => diasEntre(lancamento.data, t.vencimento) <= 5)
  if (porValorEData.length === 1) {
    return casado(lancamento, porValorEData[0].cod_titulo)
  }

  // 3. Ja existe lancamento casado com um titulo do mesmo valor -> duplicado
  const tituloJaClaimado = titulosAbertos.find(
    (t) => claimados.has(t.cod_titulo) && Math.abs(t.valor - lancamento.valor) < 0.01
  )
  if (tituloJaClaimado) {
    return divergente(lancamento, 'duplicado', tituloJaClaimado.cod_titulo, tituloJaClaimado.valor)
  }

  // 4. Valor igual a soma de dois titulos do mesmo cliente
  const par = encontrarParSoma(disponiveis, lancamento.valor)
  if (par) {
    return divergente(lancamento, 'possivel_soma')
  }

  // 5. Nenhum titulo com esse valor
  return divergente(lancamento, 'sem_titulo_correspondente')
}

function encontrarParSoma(titulos: Titulo[], valorAlvo: number): [Titulo, Titulo] | null {
  const porCliente = new Map<string, Titulo[]>()
  for (const t of titulos) {
    if (!porCliente.has(t.cod_cliente)) porCliente.set(t.cod_cliente, [])
    porCliente.get(t.cod_cliente)!.push(t)
  }
  for (const grupo of porCliente.values()) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        if (Math.abs(grupo[i].valor + grupo[j].valor - valorAlvo) < 0.01) {
          return [grupo[i], grupo[j]]
        }
      }
    }
  }
  return null
}
