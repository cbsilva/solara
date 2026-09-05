export interface LinhaLancamento {
  data: string // ISO format YYYY-MM-DD
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

export interface TituloBruto {
  cod_titulo: string
  cod_cliente: string
  nota_fiscal?: string
  valor: number
  vencimento: string
  status: string
}

// Le um CSV de titulos enviado pelo usuario (SPEC 5.3: "Se o usuario subiu
// titulos, usar esse arquivo; senao, usar a tabela titulos_receber").
// Mesmas colunas de titulos_receber: cod_titulo, cod_cliente, nota_fiscal,
// valor, vencimento, status.
export function limparTitulos(conteudo: string): TituloBruto[] {
  const linhas = conteudo.split('\n').filter((l) => l.trim())
  if (linhas.length === 0) return []

  const separador = linhas[0].includes(';') ? ';' : ','
  const cabecalho = linhas[0].split(separador).map((c) => c.trim().toLowerCase())
  const idx = (nomes: string[]) => cabecalho.findIndex((c) => nomes.some((n) => c.includes(n)))

  const idxCod = idx(['cod_titulo', 'titulo'])
  const idxCliente = idx(['cod_cliente', 'cliente'])
  const idxNota = idx(['nota_fiscal', 'nota', 'nf'])
  const idxValor = idx(['valor'])
  const idxVencimento = idx(['vencimento'])
  const idxStatus = idx(['status'])

  if (idxCod === -1 || idxValor === -1 || idxVencimento === -1) {
    throw new Error('Arquivo de títulos precisa ter ao menos cod_titulo, valor e vencimento')
  }

  const resultado: TituloBruto[] = []
  for (let i = 1; i < linhas.length; i++) {
    const colunas = linhas[i].split(separador).map((c) => c.trim())
    if (colunas.length < 2) continue
    try {
      resultado.push({
        cod_titulo: colunas[idxCod],
        cod_cliente: idxCliente !== -1 ? colunas[idxCliente] : '',
        nota_fiscal: idxNota !== -1 ? colunas[idxNota] : undefined,
        valor: converterValor(colunas[idxValor]),
        vencimento: converterData(colunas[idxVencimento]),
        status: idxStatus !== -1 ? colunas[idxStatus].toLowerCase() : 'aberto',
      })
    } catch {
      continue
    }
  }
  return resultado
}

export function limparExtrato(conteudo: string): LinhaLancamento[] {
  // Tentar diferentes encodings se necessário
  let linhas = conteudo.split('\n')

  // Detectar separador
  const primeiraLinha = linhas[0] || ''
  const separador = primeiraLinha.includes(';') ? ';' : ','

  // Verificar se é formato limpo (cabeçalho = data,descricao,valor,tipo)
  const ehFormatoLimpo = primeiraLinha.toLowerCase().includes('data') &&
    (primeiraLinha.toLowerCase().includes('descricao') ||
      primeiraLinha.toLowerCase().includes('descri'))

  if (ehFormatoLimpo) {
    // Formato já limpo
    return processarLinhasLimpas(linhas, separador)
  }

  // Formato bruto - pular até encontrar linha com "Data"
  let indiceCabecalho = -1
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase().includes('data')) {
      indiceCabecalho = i
      break
    }
  }

  if (indiceCabecalho === -1) {
    throw new Error('Arquivo não tem coluna Data')
  }

  linhas = linhas.slice(indiceCabecalho)
  return processarLinhasLimpas(linhas, separador)
}

function processarLinhasLimpas(linhas: string[], separador: string): LinhaLancamento[] {
  const resultado: LinhaLancamento[] = []
  const cabecalho = linhas[0].split(separador).map((s) => s.trim().toLowerCase())

  // Encontrar índices das colunas
  const idxData = cabecalho.findIndex((c) => c.includes('data'))
  const idxDescricao = cabecalho.findIndex(
    (c) => c.includes('descri') || c.includes('descricao')
  )
  const idxValor = cabecalho.findIndex(
    (c) => c.includes('valor') || c.includes('credit') || c.includes('debito')
  )
  const idxTipo = cabecalho.findIndex((c) => c.includes('tipo'))

  if (idxData === -1 || idxDescricao === -1 || idxValor === -1) {
    throw new Error('Colunas obrigatórias não encontradas (data, descricao, valor)')
  }

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()

    // Pular linhas vazias e de SALDO
    if (!linha || linha.toUpperCase().includes('SALDO')) {
      continue
    }

    const colunas = linha.split(separador).map((s) => s.trim())

    try {
      const data = converterData(colunas[idxData])
      const descricao = colunas[idxDescricao]
      const valor = converterValor(colunas[idxValor])

      // Determinar tipo
      let tipo: 'credito' | 'debito' = 'credito'
      if (idxTipo !== -1) {
        tipo = colunas[idxTipo].toLowerCase().includes('debito') ? 'debito' : 'credito'
      } else {
        // Se não houver coluna tipo, usar valor (negativo = débito)
        tipo = valor < 0 ? 'debito' : 'credito'
      }

      resultado.push({
        data,
        descricao,
        valor: Math.abs(valor),
        tipo,
      })
    } catch (err) {
      // Ignorar linhas com erro de parse
      continue
    }
  }

  return resultado
}

function converterData(dataStr: string): string {
  // Suporta: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
  const limpo = dataStr.trim()

  // Se já estiver em ISO (yyyy-mm-dd), retornar
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    return limpo
  }

  // Tentar dd/mm/yyyy ou dd-mm-yyyy
  const match = limpo.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (match) {
    const [_, dia, mes, ano] = match
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }

  throw new Error(`Data inválida: ${dataStr}`)
}

function converterValor(valorStr: string): number {
  const limpo = valorStr.trim()

  // Remover símbolos de moeda
  let sem = limpo.replace(/[R$\s]/g, '')

  // Converter formato brasileiro (1.250,00) para inglês (1250.00)
  if (sem.includes(',') && sem.includes('.')) {
    // Formato: 1.250,00
    sem = sem.replace('.', '').replace(',', '.')
  } else if (sem.includes(',')) {
    // Formato: 1250,00
    sem = sem.replace(',', '.')
  }

  const num = parseFloat(sem)
  if (isNaN(num)) {
    throw new Error(`Valor inválido: ${valorStr}`)
  }

  return num
}
