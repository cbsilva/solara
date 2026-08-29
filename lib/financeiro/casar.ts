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
  status: 'aberto' | 'pago' | 'cancelado'
  nota_fiscal?: string
}

export interface ResultadoCasamento {
  lancamentos: Lancamento[]
  divergencias: {
    lancamento: Lancamento
    tipo_inicial: string
    cod_titulo?: string
  }[]
}

export function casarLancamentos(
  lancamentos: { data: string; descricao: string; valor: number; tipo: 'credito' | 'debito' }[],
  titulos: Titulo[]
): ResultadoCasamento {
  const lancamentosProcessados: Lancamento[] = []
  const divergencias: { lancamento: Lancamento; tipo_inicial: string; cod_titulo?: string }[] = []

  // Agrupar títulos por status
  const titulosAbertos = titulos.filter((t) => t.status === 'aberto')

  for (const lancamento of lancamentos) {
    // Débitos são ignorados
    if (lancamento.tipo === 'debito') {
      lancamentosProcessados.push({
        ...lancamento,
        situacao: 'ignorado',
      })
      continue
    }

    // Créditos - tentar casar
    const resultado = casarCredito(lancamento, titulosAbertos)

    if (resultado.situacao === 'casado') {
      lancamentosProcessados.push(resultado.lancamento)
    } else {
      lancamentosProcessados.push(resultado.lancamento)
      divergencias.push({
        lancamento: resultado.lancamento,
        tipo_inicial: resultado.tipo_inicial,
        cod_titulo: resultado.cod_titulo,
      })
    }
  }

  // Verificar títulos vencidos sem pagamento
  const datas = lancamentosProcessados
    .filter((l) => l.situacao === 'casado')
    .map((l) => new Date(l.data))
  const dataFinal = datas.length > 0 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : new Date()

  for (const titulo of titulosAbertos) {
    const vencimento = new Date(titulo.vencimento)
    if (vencimento < dataFinal) {
      // Verificar se há um lançamento casado com este título
      const temCasamento = lancamentosProcessados.some(
        (l) => l.cod_titulo_casado === titulo.cod_titulo
      )

      if (!temCasamento) {
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
        })
      }
    }
  }

  return {
    lancamentos: lancamentosProcessados,
    divergencias,
  }
}

function casarCredito(
  lancamento: { data: string; descricao: string; valor: number; tipo: 'credito' | 'debito' },
  titulosAbertos: Titulo[]
): {
  lancamento: Lancamento
  tipo_inicial: string
  situacao: 'casado' | 'divergente'
  cod_titulo?: string
} {
  // 1. Procurar NF-<n> na descrição
  const matchNF = lancamento.descricao.match(/NF-?(\d+)/i)
  if (matchNF) {
    const nf = matchNF[1]
    const tituloNF = titulosAbertos.find(
      (t) => t.nota_fiscal && t.nota_fiscal.includes(nf) && Math.abs(t.valor - lancamento.valor) < 0.01
    )

    if (tituloNF) {
      return {
        lancamento: {
          ...lancamento,
          cod_titulo_casado: tituloNF.cod_titulo,
          situacao: 'casado',
        },
        tipo_inicial: 'casado_nf',
        situacao: 'casado',
        cod_titulo: tituloNF.cod_titulo,
      }
    }

    // NF citada mas sem titulo em aberto com a mesma nota e valor
    return {
      lancamento: {
        ...lancamento,
        situacao: 'divergente',
        tipo_inicial: 'valor_diferente_mesma_nf',
      },
      tipo_inicial: 'valor_diferente_mesma_nf',
      situacao: 'divergente',
      cod_titulo: undefined,
    }
  }

  // 2. Procurar título com mesmo valor e vencimento próximo (até 5 dias)
  const titulosPorValor = titulosAbertos.filter((t) => Math.abs(t.valor - lancamento.valor) < 0.01)

  if (titulosPorValor.length === 1) {
    const titulo = titulosPorValor[0]
    const dias = Math.abs(
      Math.floor(
        (new Date(lancamento.data).getTime() - new Date(titulo.vencimento).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    )

    if (dias <= 5) {
      return {
        lancamento: {
          ...lancamento,
          cod_titulo_casado: titulo.cod_titulo,
          situacao: 'casado',
        },
        tipo_inicial: 'casado_valor_data',
        situacao: 'casado',
        cod_titulo: titulo.cod_titulo,
      }
    }
  }

  // 3. Procurar possível soma de dois títulos
  if (titulosPorValor.length > 1) {
    // Procurar pares que somem o valor
    for (let i = 0; i < titulosPorValor.length; i++) {
      for (let j = i + 1; j < titulosPorValor.length; j++) {
        if (
          Math.abs(titulosPorValor[i].valor + titulosPorValor[j].valor - lancamento.valor) < 0.01
        ) {
          return {
            lancamento: {
              ...lancamento,
              situacao: 'divergente',
              tipo_inicial: 'possivel_soma',
            },
            tipo_inicial: 'possivel_soma',
            situacao: 'divergente',
          }
        }
      }
    }
  }

  // 4. Procurar duplicata
  const tituloExato = titulosAbertos.find(
    (t) => Math.abs(t.valor - lancamento.valor) < 0.01 && t.status === 'aberto'
  )

  if (tituloExato) {
    return {
      lancamento: {
        ...lancamento,
        situacao: 'divergente',
        tipo_inicial: 'duplicado',
      },
      tipo_inicial: 'duplicado',
      situacao: 'divergente',
      cod_titulo: tituloExato.cod_titulo,
    }
  }

  // 5. Nenhuma correspondência
  return {
    lancamento: {
      ...lancamento,
      situacao: 'divergente',
      tipo_inicial: 'sem_titulo_correspondente',
    },
    tipo_inicial: 'sem_titulo_correspondente',
    situacao: 'divergente',
  }
}
