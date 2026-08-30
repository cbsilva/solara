import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from './supabase/server'
import fs from 'fs'
import path from 'path'

interface Contexto {
  area: string
  item_tipo: string
  item_id: string
  chamado_por?: string
}

interface RespostaAgente {
  saida: Record<string, any>
  execucao_id: string
}

export async function agente(
  papel: string,
  entrada: Record<string, any>,
  contexto: Contexto
): Promise<RespostaAgente> {
  const supabase = createServerClient()
  const client = new Anthropic()

  try {
    // 1. Criar registro com status 'rodando'
    const { data: execucaoInicioData, error: erroInsert } = await supabase
      .from('execucoes_agentes')
      .insert({
        area: contexto.area,
        item_tipo: contexto.item_tipo,
        item_id: contexto.item_id,
        agente: papel,
        chamado_por: contexto.chamado_por || null,
        status: 'rodando',
        entrada,
        inicio: new Date().toISOString(),
      })
      .select()

    if (erroInsert || !execucaoInicioData || execucaoInicioData.length === 0) {
      throw new Error(`Erro ao inserir execução: ${erroInsert?.message || 'Sem dados retornados'}`)
    }

    const execucaoId = execucaoInicioData[0].id

    // 2. Ler prompt
    const promptPath = path.join(
      process.cwd(),
      'prompts',
      contexto.area,
      `${papel}.md`
    )

    let systemPrompt = ''
    try {
      systemPrompt = fs.readFileSync(promptPath, 'utf-8')
    } catch (err) {
      throw new Error(`Prompt não encontrado: ${promptPath}`)
    }

    // 3. Chamar API Anthropic
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(entrada),
        },
      ],
    })

    // 4. Extrair conteúdo e fazer parse
    const conteudo = response.content[0]
    if (conteudo.type !== 'text') {
      throw new Error('Resposta não é texto')
    }

    let saida: Record<string, any>
    try {
      saida = JSON.parse(conteudo.text)
    } catch (err) {
      throw new Error(`Falha ao fazer parse JSON: ${conteudo.text}`)
    }

    // 5. Atualizar registro com status 'ok'
    const { error: erroUpdate } = await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida,
        tokens_entrada: response.usage.input_tokens,
        tokens_saida: response.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq('id', execucaoId)

    if (erroUpdate) {
      throw new Error(`Erro ao atualizar execução: ${erroUpdate.message}`)
    }

    return {
      saida,
      execucao_id: execucaoId,
    }
  } catch (erro) {
    // Se deu erro, registrar na linha de execução
    if (erro instanceof Error) {
      // Tentar atualizar o status para erro (pode falhar se o insert inicial falhou)
      const { data: execucoes, error: erroQuery } = await supabase
        .from('execucoes_agentes')
        .select('id')
        .eq('agente', papel)
        .eq('item_id', contexto.item_id)
        .eq('status', 'rodando')
        .order('inicio', { ascending: false })
        .limit(1)

      if (execucoes && execucoes.length > 0) {
        await supabase
          .from('execucoes_agentes')
          .update({
            status: 'erro',
            erro: erro.message,
            fim: new Date().toISOString(),
          })
          .eq('id', execucoes[0].id)
      }
    }

    throw erro
  }
}
