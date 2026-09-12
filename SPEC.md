# SPEC — Solara OS

**O que o construtor precisa saber.** Este documento é lido pelo Claude Code. Cada seção é construída quando a instrução da aula pedir. Os nomes de seção são referenciados nas instruções: Fundação, Casca, Motor, Vendas, Financeiro, RH, Jurídico, Operações.

---

## 0. Visão geral

Aplicação web com login, um menu de áreas e, dentro de cada área, telas onde agentes de IA processam itens (pedidos ou divergências) e uma pessoa aprova o resultado.

Duas camadas:

- **Casca**: login, áreas, administração de usuários.
- **Motor**: a função `agente()`, o registro de execuções, o organograma em tempo real e a fila de aprovação. O motor é o mesmo para toda área.

Áreas nesta versão: Vendas, Financeiro, RH, Jurídico e Operações.

Stack: Next.js App Router + TypeScript, Supabase (Auth, Postgres, Realtime), API Anthropic, Vercel. Ver CLAUDE.md.

---

## 1. Fundação

- Projeto Next.js na raiz da pasta (`app/`, `lib/`, `components/`).
- Supabase Auth com e-mail e senha. Página `/login`. Sem cadastro público: usuários são criados pelo admin (seção 2).
- Página `/` protegida: se não estiver logado, redireciona para `/login`. Por enquanto mostra só "Solara OS" e o e-mail do usuário.
- Cliente Supabase para browser (anon key) e para servidor (service role, só em rotas de API).

---

## 2. Casca

### 2.1 Tabela `perfis`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | = auth.users.id |
| email | text | |
| nome | text | |
| papel | text | `admin` ou `operador` |
| areas | text[] | ex.: `{vendas, financeiro}` |
| criado_em | timestamptz | default now() |
| demo | boolean | default `false`. Ver "usuário demo" abaixo |

Ao criar um usuário no Supabase Auth, o admin também cria a linha em `perfis`. Para a aula: o primeiro usuário (o instrutor) é criado direto no painel do Supabase com `papel = admin` e todas as áreas.

**Usuário demo ("admin sem poderes"):** `papel = 'admin'` com `demo = true`. Navega por qualquer tela (inclusive `/admin`, porque a checagem de acesso é por `papel`), mas não executa nenhuma ação de administrador de verdade — ver 2.3 e 2.4. `demo` é lido e travado por `eh_demo()` (`sql/perfis_demo.sql`), no mesmo padrão de `eh_admin()`/`tem_area()`.

### 2.2 Menu de áreas (`/`)
Cartões: Vendas, Financeiro (ativos, só aparecem se o usuário tem a área em `perfis.areas`), RH, Jurídico, Operações (ativos, só aparecem se o usuário tem a área em `perfis.areas`). Nenhum "em breve" nesta versão.

### 2.3 Admin (`/admin`, só `papel = admin`)
Tabela de perfis com: e-mail, nome, papel, áreas. Formulário para criar usuário (e-mail, senha inicial, nome, papel, áreas). Usa a service role numa rota de API para criar no Auth e em `perfis`.

As rotas `POST /api/admin/criar-usuario`, `PUT /api/admin/editar-usuario` e `GET /api/admin/listar-usuarios` exigem sessão válida **e** `perfis.papel = 'admin'` do chamador (`lib/verificar-admin.ts`) — verificado no servidor, não só escondido na tela. As duas primeiras (as que escrevem) também exigem `perfis.demo = false`: usuário demo autenticado vê a tela, mas o formulário de criar usuário e o botão Editar ficam desabilitados, e uma chamada direta às rotas é recusada com 403 mesmo assim.

### 2.4 Tabela `perfis_usuario` e permissão de uso de agentes
| coluna | tipo | obs |
|---|---|---|
| id | uuid | = auth.users.id |
| usar_agente | boolean | default false |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Controla, por usuário, se ele pode disparar o processamento por agentes (independente do `papel`/`areas` de `perfis`, que controlam acesso à área). Toda rota de API que executa um orquestrador (`POST /api/vendas/processar`, `POST /api/financeiro/conciliar`, `POST /api/rh/processar`) chama `verificarPermissaoAgente` (`lib/verificar-permissao-agente.ts`) antes de rodar; se `usar_agente` for `false` ou a linha não existir, recusa com erro.

Aba **Permissões de Agentes** em `/admin`: lista todos os usuários com um toggle Ativar/Desativar que faz upsert em `perfis_usuario` direto do navegador (via supabase-js, sem rota de API). RLS em `perfis_usuario` (`sql/perfis_demo.sql`): qualquer admin (real ou demo) lê a tabela, mas só admin com `demo = false` consegue inserir/atualizar — usuário demo vê os toggles desabilitados na tela, e mesmo chamando `perfis_usuario.upsert(...)` direto pelo console do navegador a escrita é recusada pela policy.

---

## 3. Motor

### 3.1 Tabela `execucoes_agentes`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| area | text | `vendas` ou `financeiro` |
| item_tipo | text | `pedido` ou `divergencia` |
| item_id | text | cod_pedido ou id da divergência |
| agente | text | triador, pesquisador, redator, revisor, investigador, consolidador |
| chamado_por | uuid | id da execução pai (null quando é o orquestrador quem chama) |
| status | text | `rodando`, `ok`, `erro` |
| entrada | jsonb | |
| saida | jsonb | |
| erro | text | |
| tokens_entrada | int | |
| tokens_saida | int | |
| inicio | timestamptz | |
| fim | timestamptz | |

Habilitar Realtime nesta tabela (Database → Replication).

### 3.2 Função `agente(papel, entrada, contexto)` em `lib/agente.ts`
Parâmetros:
- `papel`: string, um dos nomes acima.
- `entrada`: objeto; vira o conteúdo da mensagem do usuário, serializado em JSON.
- `contexto`: `{ area, item_tipo, item_id, chamado_por? }`, usado para gravar o registro.

Comportamento:
1. Insere linha em `execucoes_agentes` com `status = rodando`, `inicio = now()`, entrada.
2. Lê o system prompt de `prompts/<area>/<papel>.md`.
3. Chama a API Anthropic (`claude-sonnet-4-6`, `max_tokens 2000`).
4. Faz `JSON.parse` do texto retornado. Se falhar, marca `erro` e lança exceção.
5. Atualiza a linha com `status = ok`, `saida`, tokens, `fim`.
6. Devolve `{ saida, execucao_id }`. O `execucao_id` é passado como `chamado_por` quando esse agente dispara outro (não ocorre nesta versão: quem dispara é sempre o orquestrador, então `chamado_por` recebe o id da execução "orquestrador" descrita abaixo).

Para o organograma ter uma raiz, o orquestrador cria ele mesmo uma linha em `execucoes_agentes` com `agente = orquestrador` no início do processamento e passa o id dela como `chamado_por` para todos os agentes que dispara. Ao final, atualiza essa linha com `status = ok`.

### 3.3 Componente `Organograma` (`components/Organograma.tsx`)
Recebe `area` e `item_id`. Assina `execucoes_agentes` por Realtime filtrando por `item_id`.
Desenha: o orquestrador no topo; os agentes da área abaixo (Vendas: triador, pesquisador, redator, revisor; Financeiro: investigador, consolidador, revisor); seta do orquestrador para cada agente.
Estado visual de cada cartão:
- sem execução: cinza claro
- `rodando`: pulsando (animação CSS)
- `ok`: cor sólida, mostra tempo em segundos e tokens
- `erro`: vermelho
No Financeiro, o cartão do investigador mostra "N rodando / M concluídos", porque são vários.
Quando o revisor devolve (saída com `aprovado = false`), a seta entre revisor e redator fica vermelha por 3 segundos.

### 3.4 Fila de aprovação
Tabela `aprovacoes`:
| coluna | tipo | obs |
|---|---|---|
| id | uuid | |
| area | text | |
| item_tipo | text | |
| item_id | text | |
| titulo | text | resumo em uma linha |
| proposta | jsonb | o que os agentes propõem (resposta ao cliente ou hipótese de conciliação) |
| status | text | `pendente`, `aprovada`, `editada`, `rejeitada` |
| decidido_por | uuid | perfis.id |
| decidido_em | timestamptz | |
| observacao | text | |

Componente `FilaAprovacao` (`components/FilaAprovacao.tsx`): lista de itens pendentes da área; ao abrir um item mostra a proposta, um campo editável e três botões: Aprovar, Salvar edição e aprovar, Rejeitar (pede observação). O mesmo componente é usado em Vendas e Financeiro.

### 3.5 Detalhe de execução
Componente `LinhaDoTempo`: lista as execuções de um `item_id` em ordem, com agente, status, tempo, tokens; ao expandir, mostra entrada e saída em JSON formatado.

---

## 4. Vendas

Rota: `/vendas`. Só para usuários com `vendas` em `perfis.areas`.

### 4.1 Tela
Layout em duas partes:
- Em cima: `Organograma` do pedido selecionado (ou vazio).
- Embaixo: kanban de `pedidos_orcamento` com colunas por `status`: `novo`, `processando`, `aguardando_aprovacao`, `respondido`, `rejeitado`. Cartão mostra cod_pedido, nome do cliente (join com `clientes`), canal, data e as primeiras 80 letras da mensagem. Cartões em `novo` têm o botão **Processar**.
- Botão **Novo pedido** abre um formulário: cliente (select de `clientes`), canal, mensagem. Salva em `pedidos_orcamento` com status `novo` e cod_pedido sequencial (PED031, PED032…).
- Aba **Aprovações** mostra `FilaAprovacao` da área vendas.
- Clicar num cartão abre um painel lateral com `LinhaDoTempo`.

O kanban se atualiza por Realtime na tabela `pedidos_orcamento`.

### 4.2 Rota de API `POST /api/vendas/processar` (body: `{ cod_pedido }`)
`export const maxDuration = 60`. Exige sessão válida, `vendas` em `perfis.areas` (`lib/verificar-area.ts`) e `usar_agente = true` (`lib/verificar-permissao-agente.ts`). Executa o orquestrador de Vendas (`lib/orquestradores/vendas.ts`):

1. Atualiza pedido para `processando`. Cria a execução raiz `orquestrador`.
2. **Triador**: entrada `{ mensagem, canal, cliente: {cod_cliente, nome, segmento} }`. Saída esperada (definida no prompt): `{ tipo, itens: [{descricao_cliente, quantidade, unidade}], prazo_desejado, pede_desconto, urgencia, observacoes }`. `tipo` é um de `orcamento`, `complemento`, `reclamacao`, `fora_do_ramo`, `spam`, `outro`.
   - Se `tipo` não for `orcamento` nem `complemento`: cria item em `aprovacoes` com `titulo = "Não é orçamento: <tipo>"` e a saída do Triador como proposta; pedido vai para `aguardando_aprovacao`; encerra.
3. **Pesquisador**: duas consultas ao banco em paralelo (`Promise.all`), feitas em código, não pelo modelo:
   - catálogo: para cada item do Triador, busca em `produtos` por similaridade de descrição (`ilike` com as palavras principais); traz os candidatos com preço, preço acima de 100, estoque, prazo de reposição.
   - cliente: linha de `clientes` + pedidos anteriores do mesmo cliente nos últimos 30 dias.
   Em seguida chama o agente `pesquisador` com `{ itens_pedidos, candidatos_catalogo, cliente, pedidos_anteriores }` para ele casar cada item a um produto (ou dizer que não existe) e montar o contexto: `{ itens: [{cod_produto, descricao, quantidade, preco_aplicado, estoque, atende_estoque, prazo_reposicao_dias, existe}], condicao_pagamento_dias, desconto_maximo_pct, observacoes }`.
4. **Redator**: entrada `{ triagem, contexto, cliente }`. Saída `{ resposta, resumo }`. A resposta é o texto que a Marcela enviaria.
5. **Revisor**: entrada `{ resposta, contexto, regras }` onde `regras` vem do prompt. Saída `{ aprovado, motivos: [] }`.
   - Se `aprovado = false`: chama o Redator de novo com `{ ...entrada_anterior, ajustes: motivos }` e o Revisor de novo. No máximo 2 voltas. Se ainda reprovar, segue para a fila com os motivos anexados.
   - Depois da última volta, uma checagem determinística em código (não pelo modelo) confere `contexto.itens[].preco_aplicado` contra o preço real em `produtos` (respeitando a faixa de quantidade > 100) e o desconto implícito contra `cliente.desconto_maximo_pct`, e `atende_estoque` contra o estoque real. Se algo não bater, força `revisao.aprovado = false` e anexa o motivo — regra de negócio com impacto financeiro não fica só a critério do modelo.
6. Cria item em `aprovacoes` com `titulo = "<cliente> · <resumo>"`, `proposta = { resposta, triagem, contexto, revisao }`. Pedido vai para `aguardando_aprovacao`. Fecha a execução raiz.

### 4.3 Decisão na fila
Aprovar ou editar: pedido vai para `respondido`. Rejeitar: pedido vai para `rejeitado`. Ambas gravam `decidido_por` e `decidido_em`.

---

## 5. Financeiro

Rota: `/financeiro`. Só para usuários com `financeiro` em `perfis.areas`.

### 5.1 Tabelas
`extratos_importados`: id, nome_arquivo, importado_em, importado_por, total_linhas, total_creditos.
`lancamentos`: id, extrato_id, data, descricao, valor, tipo (`credito`/`debito`), cod_titulo_casado (null se não casou), situacao (`casado`, `divergente`, `ignorado`).
`divergencias`: id, extrato_id, tipo_inicial (ver 5.3), lancamento_id (pode ser null), cod_titulo (pode ser null), valor_lancamento, valor_titulo, status (`nova`, `investigando`, `aguardando_aprovacao`, `resolvida`), hipotese jsonb.

### 5.2 Tela
- Em cima: `Organograma` da conciliação corrente.
- Bloco **Importar**: upload do extrato (obrigatório) e dos títulos (opcional). Aceita CSV limpo ou bruto. Depois do upload mostra **antes e depois**: as 6 primeiras linhas do arquivo como veio e as 6 primeiras linhas normalizadas, lado a lado. O "antes e depois" é gerado no navegador (só leitura, sem gravar nada); o texto dos arquivos (máx. 5MB cada) é enviado para `POST /api/financeiro/importar`, que exige sessão válida e `financeiro` em `perfis.areas`, faz a limpeza/casamento e grava `extratos_importados`/`lancamentos`/`divergencias` com a service role — não é mais escrito direto do navegador.
- Botão **Conciliar**.
- Resultado em três listas: Bateram (verde), Divergências (kanban com colunas `nova`, `investigando`, `aguardando_aprovacao`, `resolvida`), Ignorados (débitos).
- Aba **Relatório** com o texto do Consolidador.
- Aba **Aprovações** com `FilaAprovacao` da área financeiro.

### 5.3 Limpeza e casamento (código, sem modelo) — `lib/financeiro/limpar.ts` e `casar.ts`
Limpeza do extrato bruto: detectar separador (`;` ou `,`); pular linhas até a que começa com `Data`; ignorar linhas de SALDO; converter `dd/mm/aaaa` para ISO; converter `1.250,00` para 1250.00; descartar coluna de saldo; ler latin-1 se utf-8 falhar. Se o arquivo já estiver limpo (cabeçalho `cod_lancamento,data,...`), usar direto.
Se o usuário subiu títulos, usar esse arquivo; senão, usar a tabela `titulos_receber`.

Casamento, só para créditos:
1. Se a descrição contém `NF-<n>` e existe título com essa nota e mesmo valor: **casado**.
2. Senão, se existe exatamente um título em aberto com mesmo valor e vencimento a até 5 dias da data do lançamento: **casado**.
3. Senão: **divergente**, com `tipo_inicial`:
   - `valor_diferente_mesma_nf`: NF encontrada, valor diferente.
   - `sem_titulo_correspondente`: nenhum título com esse valor.
   - `possivel_soma`: o valor é igual à soma de dois títulos do mesmo cliente (procurar pares).
   - `duplicado`: já existe lançamento casado com o mesmo título.
Débitos: `ignorado`.
Depois do casamento, todo título em aberto com vencimento anterior à data final do extrato e sem lançamento casado vira divergência `vencido_sem_pagamento`.

### 5.4 Rota `POST /api/financeiro/conciliar` (body `{ extrato_id }`)
`maxDuration = 60`. Exige sessão válida, `financeiro` em `perfis.areas` e `usar_agente = true`. Orquestrador `lib/orquestradores/financeiro.ts`:
1. Cria execução raiz. Divergências vão para `investigando`.
2. **Investigador**, um por divergência, todos em `Promise.all`. Entrada: `{ divergencia, lancamento, titulos_candidatos }` onde candidatos são os títulos do mesmo cliente (se identificável pela descrição) ou de valor próximo (±10%), com vencimento a até 30 dias. Saída `{ hipotese, explicacao, confianca (0-1), acao_sugerida, cod_titulos_envolvidos: [], valor_a_baixar, valor_pendente }`. `hipotese` é um de: `pagamento_parcial`, `dois_titulos_um_pagamento`, `duplicidade`, `diferenca_centavos`, `atraso_com_juros`, `vencido_sem_pagamento`, `deposito_nao_identificado`, `nao_e_titulo`, `outro`.
3. **Consolidador**: as hipóteses são divididas em lotes de até 3 (`consolidarEmLotes`) e o Consolidador roda em paralelo sobre cada lote — o relatório completo facilmente passa de `max_tokens = 2000` numa chamada só. Cada lote recebe `{ resumo_casamento, hipoteses: <lote>, ajustes? }` e devolve `{ relatorio_trecho, acoes: [] }` (sem repetir o resumo executivo). O relatório final é o resumo (montado em código a partir de `resumo_casamento`) seguido da concatenação dos trechos; as ações de todos os lotes são mescladas e renumeradas.
4. **Revisor**: entrada `{ hipoteses, titulos_abertos, relatorio }`. Saída `{ aprovado, motivos: [] }`. Confere que todo `cod_titulo` citado existe e que `valor_a_baixar + valor_pendente = valor_titulo` em cada hipótese. Se reprovar, refaz todos os lotes do Consolidador uma vez com os motivos.
5. Cada hipótese vira um item em `aprovacoes` (`item_tipo = divergencia`, `titulo = "<hipotese> · <cliente ou descrição> · R$ <valor>"`). Divergências vão para `aguardando_aprovacao`. Fecha a execução raiz.

### 5.5 Decisão na fila
Aprovar: divergência `resolvida`, título(s) recebem status conforme a ação (`pago`, `pago_parcial`, `vencido`). Editar: mesma coisa com os valores editados. Rejeitar: divergência volta para `nova` com a observação.

---

## 6. Recursos Humanos

Rota: `/rh`. Só para usuários com `rh` em `perfis.areas`.

### 6.1 Tabelas
As duas tabelas são importadas dos CSVs de `dados/` (ver `sql/rh.sql`). Não recriar nem alterar colunas.
`colaboradores`: `id_colaborador` (ex.: COL001), `nome`, `email`, `telefone`, `criado_em`.
`faixas_salariais`: `id_faixa` (ex.: FX001), `id_colaborador`, `valor`, `inicio` (vigência, null enquanto não aprovada), `status` (`nova`, `processando`, `aguardando_aprovacao`, `aprovada`, `rejeitada`), `justificativa`, `criado_em`.
O salário atual de um colaborador é a última faixa com `status = aprovada`.

### 6.2 Tela
Duas abas:
- **Colaboradores**: tabela de `colaboradores` (id, nome, e-mail, telefone). Botão **Novo colaborador** abre um formulário (nome, e-mail, telefone) e salva com `id_colaborador` sequencial (COL009, COL010…). Sem agentes — cadastro puro.
- **Faixas salariais**: em cima o `Organograma` da faixa selecionada (ou vazio). Embaixo, kanban de `faixas_salariais` com colunas por `status`: `nova`, `processando`, `aguardando_aprovacao`, `aprovada`, `rejeitada`. Cartão mostra id_faixa, nome do colaborador (join com `colaboradores`), valor pretendido, salário atual e as primeiras 80 letras da justificativa. Cartões em `nova` têm o botão **Processar**. Botão **Nova faixa** abre um formulário: colaborador (select de `colaboradores`), valor pretendido, justificativa. Salva em `faixas_salariais` com `status = nova` e `id_faixa` sequencial.
- Aba **Aprovações** mostra `FilaAprovacao` da área rh.
- Clicar num cartão abre um painel lateral com `LinhaDoTempo`.

O kanban se atualiza por Realtime na tabela `faixas_salariais`.

`Organograma` desenha, para `rh`: triador, pesquisador, redator, revisor (mesmo conjunto de Vendas).

### 6.3 Rota de API `POST /api/rh/processar` (body: `{ id_faixa }`)
`export const maxDuration = 60`. Exige sessão válida, `rh` em `perfis.areas` e `usar_agente = true`. Executa o orquestrador de RH (`lib/orquestradores/rh.ts`):

1. Atualiza a faixa para `processando`. Cria a execução raiz `orquestrador`.
2. **Triador**: entrada `{ justificativa, colaborador: {id_colaborador, nome}, valor_pretendido }`. Saída `{ tipo, resumo_pedido, observacoes }`. `tipo` é um de `alteracao_salarial`, `fora_do_rh`, `spam`, `outro`.
   - Se `tipo` não for `alteracao_salarial`: cria item em `aprovacoes` com `titulo = "Não é RH: <tipo>"` e a saída do Triador como proposta; faixa vai para `aguardando_aprovacao`; encerra.
3. **Pesquisador**: consultas ao banco em código, não pelo modelo:
   - colaborador: linha de `colaboradores`.
   - faixa atual: última faixa do mesmo colaborador com `status = aprovada` (valor e início).
   Calcula `variacao_pct = (valor_pretendido - valor_atual) / valor_atual * 100`. Em seguida chama o agente `pesquisador` com `{ colaborador, valor_atual, valor_pretendido, variacao_pct, faixas_anteriores }` para montar o contexto: `{ valor_atual, valor_pretendido, variacao_pct, tempo_desde_ultima_faixa_meses, observacoes }`.
4. **Redator**: entrada `{ triagem, contexto, colaborador }`. Saída `{ resposta, resumo }`. A resposta é a justificativa formal da alteração que o RH registraria.
5. **Revisor**: entrada `{ resposta, contexto, regras }` onde `regras` vem do prompt (teto de `variacao_pct` permitido sem exceção). Saída `{ aprovado, motivos: [] }`.
   - Se `aprovado = false`: chama o Redator de novo com `{ ...entrada_anterior, ajustes: motivos }` e o Revisor de novo. No máximo 2 voltas. Se ainda reprovar, segue para a fila com os motivos anexados.
6. Cria item em `aprovacoes` com `item_tipo = faixa`, `titulo = "<colaborador> · <resumo>"`, `proposta = { resposta, triagem, contexto, revisao }`. Faixa vai para `aguardando_aprovacao`. Fecha a execução raiz.

### 6.4 Decisão na fila
Aprovar ou editar: faixa vai para `aprovada` e recebe `inicio = hoje` (a vigência). Rejeitar: faixa vai para `rejeitada`. Ambas gravam `decidido_por` e `decidido_em`.

---

## 7. Jurídico

Rota: `/juridico`. Só para usuários com `juridico` em `perfis.areas`.

### 7.1 Tabelas (`sql/juridico.sql`)
`clausulas_padrao` (a base jurídica da empresa, importada de `dados/clausulas_padrao.csv`, não recriada pelo app): `tema` (pk: `foro`, `multa_moratoria`, `juros`, `limitacao_responsabilidade`, `multa_rescisoria`, `prazo_pagamento`, `reajuste`, `garantia`, `exclusividade`, `rescisao`, `confidencialidade`, `lgpd`, `propriedade_intelectual`, `subcontratacao`, `forca_maior`, `prazo_entrega`), `posicao_padrao` (text), `limite` (jsonb, ex.: `{"pct_mes_max": 1}`), `clausula_vetada` (bool — tema que nunca passa sem ressalva formal), `fundamento` (text — referência legal resumida), `criado_em`.
`analises_juridicas`: `id_analise` (pk, `AJ001`…), `contraparte` (text), `tipo_contrato` (text: `fornecimento`, `cliente`, `representacao_comercial`, `locacao`, `prestacao_servicos`, `transporte`, `nda`, `outro`), `texto_minuta` (text, máx. 60 000 caracteres), `valor_envolvido` (numeric, nullable), `risco_geral` (text: `baixo`/`medio`/`alto`, preenchido no fim), `status` (`nova` → `processando` → `aguardando_aprovacao` → `aprovada` \| `rejeitada`), `criado_em`.
`clausulas_analisadas`: `id` (uuid), `id_analise` (fk), `tema` (text), `texto_clausula` (text, null quando é um tema ausente), `classificacao_risco` (`alinhada`/`ajuste`/`inaceitavel`), `analise` (jsonb — saída do Investigador), `status` (`nova` → `investigando` → `aguardando_aprovacao` → `resolvida`), `criado_em`.
Realtime em `analises_juridicas` e `clausulas_analisadas`. RLS nas três tabelas (`tem_area('juridico')`; `clausulas_padrao` com escrita só `eh_admin()`).

### 7.2 Tela
Só para `juridico` em `perfis.areas`. Em cima: `Organograma` da análise selecionada (desenha triador, pesquisador, investigador — fan-out —, redator, revisor). Três abas:
- **Análises**: kanban de `analises_juridicas` por `status` (`nova`, `processando`, `aguardando_aprovacao`, `aprovada`, `rejeitada`). Cartão: id, contraparte, tipo de contrato, valor, `risco_geral`, 80 primeiras letras da minuta. Cartões em `nova` têm o botão **Processar**. Botão **Nova análise** abre um formulário: contraparte, tipo de contrato (select), valor envolvido (opcional), texto da minuta (colar, máx. 60 000 caracteres). Salva com `status = nova` e `id_analise` sequencial. Ao selecionar uma análise, abaixo do Organograma aparecem as `clausulas_analisadas` em três faixas: Alinhadas / Ajuste sugerido / Inaceitáveis.
- **Cláusulas-padrão**: tabela só-leitura de `clausulas_padrao` (tema, posição, limite, vetada, fundamento).
- **Aprovações**: `FilaAprovacao` da área `juridico`.
Clicar num cartão abre um painel lateral com `LinhaDoTempo`. O kanban se atualiza por Realtime.

### 7.3 Rota de API `POST /api/juridico/processar` (body: `{ id_analise }`)
`export const maxDuration = 60`. Exige sessão válida, `juridico` em `perfis.areas` e `usar_agente = true` (mais o `verificar-origem`). Executa o orquestrador de Jurídico (`lib/orquestradores/juridico.ts`):

1. Atualiza a análise para `processando`. Cria a execução raiz `orquestrador`.
2. **Triador**: entrada `{ texto_minuta, contraparte, tipo_contrato, valor_envolvido }`. Saída `{ tipo, resumo, objeto, partes, tipo_contrato_detectado, valor_detectado, observacoes }`. `tipo` é um de `analise_contrato`, `consulta`, `notificacao`, `fora_do_juridico`, `spam`, `outro`.
   - Se `tipo` não for `analise_contrato`: cria item em `aprovacoes` com `titulo = "Não é análise de contrato: <tipo>"` e a saída do Triador como proposta; análise vai para `aguardando_aprovacao`; encerra.
3. **Pesquisador**: em código, carrega toda a `clausulas_padrao` e as análises anteriores da mesma contraparte. Depois chama o agente `pesquisador` com `{ texto_minuta, temas_padrao, contraparte, analises_anteriores }` para segmentar a minuta: `{ clausulas: [{tema, texto_clausula, resumo}], temas_ausentes: [] }`. Em código, apaga as `clausulas_analisadas` de uma rodada anterior e grava uma linha por cláusula detectada e uma por tema ausente que seja vetado.
4. **Investigador**, um por linha de `clausulas_analisadas`, todos em `Promise.all`. Entrada `{ tema, texto_clausula, tema_ausente, posicao_padrao, limite, clausula_vetada, fundamento }`. Saída `{ classificacao_risco, problema, impacto, sugestao_redacao, fundamento_citado, confianca }`. Cada linha é atualizada com o resultado.
5. **Redator**: entrada `{ triagem, clausulas, temas_ausentes, contraparte }`. Saída `{ parecer, resumo, risco_geral, redlines: [{tema, de, para, justificativa}], ressalvas: [] }`.
6. **Revisor**: entrada `{ parecer, clausulas, temas_ausentes, regras }` onde `regras` = `REGRAS_JURIDICO` (alçada, comarca da sede, tetos de multa/juros, temas vetados). Saída `{ aprovado, motivos: [] }`. No máximo 2 voltas chamando o Redator com `ajustes`.
   - Depois da última volta, uma checagem determinística em código confere: cláusula `inaceitavel`, tema vetado fora do padrão, ausência de limitação de responsabilidade, `valor_envolvido` acima da alçada, e `risco_geral` coerente. Se algo não bater, força `revisao.aprovado = false` com o motivo e fixa `risco_geral = alto` — regra de negócio com impacto não fica só a critério do modelo.
7. Cria item em `aprovacoes` (`item_tipo = analise`, `titulo = "<contraparte> · risco <nível> · <resumo>"`, `proposta = { parecer, redlines, ressalvas, risco_geral, triagem, clausulas, revisao }`). Análise vai para `aguardando_aprovacao` com o `risco_geral`; `clausulas_analisadas` para `aguardando_aprovacao`. Fecha a execução raiz.

### 7.4 Decisão na fila
Aprovar ou editar: análise vai para `aprovada` e `clausulas_analisadas` para `resolvida`. Rejeitar: análise vai para `rejeitada` (com observação) e `clausulas_analisadas` volta para `nova`. Ambas gravam `decidido_por` e `decidido_em`. O parecer aprovado é copiado por uma pessoa para negociar — envio à contraparte fica fora do escopo.

---

## 8. Operações

Rota: `/operacoes`. Só para usuários com `operacoes` em `perfis.areas`. O que a área faz: planejar a reposição de estoque — varrer os produtos abaixo do ponto de reposição, dimensionar a compra de cada um e agrupar em ordens de compra por fornecedor para o comprador aprovar.

### 8.1 Tabelas (`sql/operacoes.sql`)
`fornecedores` (referência, importada de `dados/fornecedores.csv`, não recriada pelo app): `cod_fornecedor` (pk, `FOR001`…), `nome`, `prazo_entrega_dias` (int), `pedido_minimo_valor` (numeric), `homologado` (bool), `observacao` (text), `criado_em`.
`parametros_estoque` (referência, importada de `dados/parametros_estoque.csv`, uma linha por produto de `produtos`): `cod_produto` (pk), `ponto_reposicao` (int), `estoque_maximo` (int), `consumo_medio_mensal` (numeric), `cod_fornecedor_preferencial` (text), `criado_em`.
`ciclos_reposicao` (o lote, análogo a `extratos_importados`): `id_ciclo` (pk, `CR001`…), `disparado_em` (timestamptz default now()), `disparado_por` (uuid), `total_rupturas` (int), `status` (`novo` → `planejando` → `aguardando_aprovacao` → `concluido`).
`itens_ruptura` (análogo a `divergencias`): `id` (uuid), `id_ciclo` (fk, on delete cascade), `cod_produto` (text), `estoque_atual` (int), `ponto_reposicao` (int), `cobertura_dias` (numeric, nullable), `analise` (jsonb — saída do Investigador), `status` (`novo` → `investigando` → `aguardando_aprovacao` → `resolvido`), `criado_em`.
As **ordens de compra por fornecedor** não viram tabela: cada uma é uma linha em `aprovacoes` (`item_tipo = 'ordem'`, `item_id = id_ciclo`, `proposta = { ordem, relatorio, revisao }`). Realtime em `ciclos_reposicao` e `itens_ruptura`. RLS nas quatro tabelas (`tem_area('operacoes')`; escrita de `fornecedores` e `parametros_estoque` só `eh_admin()`).

### 8.2 Tela
Só para `operacoes` em `perfis.areas`. Botão **Planejar reposição** dispara um ciclo. Seletor dos ciclos recentes. Para o ciclo selecionado, `Organograma` (desenha investigador — fan-out —, consolidador, revisor) e cinco abas:
- **Rupturas**: kanban de `itens_ruptura` do ciclo por `status` (`novo`, `investigando`, `aguardando_aprovacao`, `resolvido`). Cartão: cod_produto, descrição (join `produtos`), estoque atual / ponto de reposição, cobertura em dias e, depois do Investigador, a quantidade sugerida, o custo e a urgência.
- **Relatório**: texto do Consolidador do ciclo (lido da primeira `aprovacoes` do ciclo).
- **Aprovações**: `FilaAprovacao` da área `operacoes`.
- **Fornecedores** e **Parâmetros**: tabelas só-leitura.
Painel lateral com `LinhaDoTempo`. Realtime em `ciclos_reposicao` e `itens_ruptura`.

### 8.3 Rota de API `POST /api/operacoes/planejar` (body: `{}` novo ciclo, ou `{ id_ciclo }` para reprocessar)
`export const maxDuration = 60`. Exige sessão válida, `operacoes` em `perfis.areas`, `usar_agente = true` e `verificar-origem`.
1. **Código:** varre `produtos` × `parametros_estoque`, seleciona `estoque < ponto_reposicao`, calcula `cobertura_dias = estoque / (consumo_medio_mensal / 30)`. Cria `ciclos_reposicao` e uma `itens_ruptura` por produto. Reprocessar apaga as `itens_ruptura` e as `aprovacoes` do ciclo antes. Se não houver ruptura, marca o ciclo `concluido` e retorna sem chamar agentes.
2. Orquestrador `lib/orquestradores/operacoes.ts` cria a execução raiz.
3. **Investigador**, um por ruptura, todos em `Promise.all`. Entrada `{ produto, parametros, cobertura_dias, fornecedor }`. Saída `{ quantidade_sugerida, custo_estimado, prazo_estimado_dias, urgencia, justificativa, cod_fornecedor }`. Cada `itens_ruptura` recebe a saída em `analise`.
4. **Consolidador**: propostas divididas em lotes de até 4 (`consolidarEmLotes`), roda em paralelo, agrupa por fornecedor em `ordens` e devolve `relatorio_trecho`. Ordens do mesmo fornecedor em lotes diferentes são mescladas em código; o relatório final é o resumo (montado em código) + os trechos.
5. **Revisor**: entrada `{ ordens, fornecedores, parametros, regras }`. Saída `{ aprovado, motivos: [] }`. Uma volta refazendo o Consolidador se reprovar.
   - Depois da volta, uma checagem determinística em código confere: fornecedor homologado, `custo_total >= pedido_minimo_valor`, `estoque_atual + quantidade <= estoque_maximo`, e `custo_total` acima da alçada (`REGRAS_OPERACOES.alcada_valor`). Se algo não bater, força `revisao.aprovado = false` com o motivo — regra de compra com impacto não fica só a critério do modelo.
6. Cada ordem por fornecedor vira um item em `aprovacoes` (`titulo = "<fornecedor> · <n> itens · R$ <custo_total>"`). `itens_ruptura` e o ciclo vão para `aguardando_aprovacao`. Fecha a execução raiz.
7. Erro: execução raiz para `erro`, ciclo e `itens_ruptura` voltam para `novo`.

### 8.4 Decisão na fila
Aprovar ou editar: as `itens_ruptura` dos produtos da ordem vão para `resolvido`. Rejeitar: voltam para `novo` (com observação). Ambas gravam `decidido_por` e `decidido_em`. A pessoa emite o pedido de compra no sistema do fornecedor — o envio real fica fora do escopo.

---

## 9. Fora do escopo desta versão
E-mail de entrada ou saída; OAuth; integração automática com ERP ou com sistema de RH; orquestrador decidido pelo modelo (tool use); áreas além de Vendas, Financeiro, Recursos Humanos, Jurídico e Operações. No Jurídico: contencioso e acompanhamento processual, integração com tribunais, assinatura eletrônica, redigir contrato do zero, prazos e peças processuais. Em Operações: emissão do pedido de compra no fornecedor, recebimento/conferência de mercadoria, expedição e rastreio de entregas, previsão de demanda além da média móvel.

---

## 10. Segurança

Avaliação completa e histórico dos achados em `SEGURANCA.md`. Postura atual:

- **RLS habilitado em todas as 21 tabelas**, com políticas por área (`lib/verificar-area.ts` no código espelha as mesmas regras: `perfis`, `execucoes_agentes`, `aprovacoes`, `pedidos_orcamento`, `clientes`, `produtos`, `titulos_receber`, `extratos_importados`, `lancamentos`, `divergencias`, `colaboradores`, `faixas_salariais`, `clausulas_padrao`, `analises_juridicas`, `clausulas_analisadas`, `fornecedores`, `parametros_estoque`, `ciclos_reposicao`, `itens_ruptura` — leitura/escrita só para quem tem a área correspondente em `perfis.areas`, com `clausulas_padrao`, `fornecedores` e `parametros_estoque` de escrita só `eh_admin()`; `perfis_usuario` só para `papel = admin`; `extrato_bancario` não é usada pelo app e fica sem política nenhuma). Duas funções auxiliares no banco: `eh_admin()` e `tem_area(area)`.
- **Rotas de API exigem sessão válida** (`lib/supabase/server.ts` → `getUsuarioAutenticado`, lê a sessão pelos cookies) **e a checagem correspondente**: `/api/admin/*` exige `papel = admin` (`lib/verificar-admin.ts`); `/api/vendas/processar`, `/api/financeiro/conciliar`, `/api/financeiro/importar`, `/api/rh/processar`, `/api/juridico/processar`, `/api/operacoes/planejar` exigem a área da rota em `perfis.areas` (`lib/verificar-area.ts`) e `usar_agente = true` (`lib/verificar-permissao-agente.ts`).
- **Prompt injection**: os prompts que recebem texto livre de fora (mensagem do cliente, justificativa de RH, descrição do extrato bancário, minuta de contrato no Jurídico) instruem o modelo a tratar esse texto como dado a classificar, nunca como instrução. Regras de negócio com impacto direto são conferidas de novo em código, não dependem só do julgamento do modelo: preço, desconto e estoque em Vendas (`lib/orquestradores/vendas.ts`) contra o catálogo real; foro, teto de responsabilidade, temas vetados e alçada em Jurídico (`lib/orquestradores/juridico.ts`) contra as `clausulas_padrao`; homologação de fornecedor, pedido mínimo, estoque máximo e alçada de compra em Operações (`lib/orquestradores/operacoes.ts`) contra `fornecedores` e `parametros_estoque`.
- **Upload de arquivos** (extrato/títulos em Financeiro) tem limite de 5MB, no navegador e na rota de API. A minuta de contrato no Jurídico é colada como texto, com limite de 60 000 caracteres no navegador e no orquestrador. Operações não recebe arquivo: a varredura de rupturas é feita sobre os dados do ERP.
- **CSRF**: toda rota de mutação (`POST`/`PUT` em `/api/admin/*`, `/api/vendas/processar`, `/api/financeiro/conciliar`, `/api/financeiro/importar`, `/api/rh/processar`, `/api/juridico/processar`, `/api/operacoes/planejar`) confere que o header `Origin` (ou `Referer`, como fallback) bate com a própria origem da requisição antes de qualquer outra checagem (`lib/verificar-origem.ts`). Requisição sem os dois headers, ou com origem diferente, recebe 403.
- **Dependências**: `next` atualizado para `16.3.4` (era `^15.0.0`), `npm audit` sem vulnerabilidades conhecidas.

Não há mais itens em aberto no `SEGURANCA.md`.

Itens do relatório ainda em aberto (baixa prioridade, ver `SEGURANCA.md`): CVE conhecida em `next`/`postcss` (correção exige upgrade major, não aplicada); proteção CSRF explícita (mitigado hoje pelo `SameSite` padrão dos cookies do Supabase).
