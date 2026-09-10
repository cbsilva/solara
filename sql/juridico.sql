-- ============================================================================
-- Modulo Juridico (POC) — clausulas-padrao, analises de contrato e clausulas analisadas
--
-- Rode este bloco UMA vez no SQL Editor do Supabase. Depois importe o CSV
-- de dados/clausulas_padrao.csv pelo Table Editor (Import data). A coluna
-- `limite` e jsonb: o texto JSON do CSV entra direto.
--
-- `execucoes_agentes` e `aprovacoes` NAO mudam: as colunas `area` e
-- `item_tipo` ja sao text livre. O modulo Juridico grava area='juridico',
-- item_tipo='analise', item_id = id_analise (ex.: AJ001).
-- ============================================================================

-- ---- clausulas_padrao ---------------------------------------------------------
-- A base juridica da Solara: uma linha por tema, com a posicao que a empresa
-- aceita, o limite numerico quando houver, se o tema e vetado (nunca passa sem
-- ressalva formal) e o fundamento legal resumido.
create table clausulas_padrao (
  tema            text primary key,          -- foro, multa_moratoria, juros, ...
  posicao_padrao  text not null,
  limite          jsonb,                     -- ex.: {"pct_mes_max": 1}
  clausula_vetada boolean not null default false,
  fundamento      text,
  criado_em       timestamptz not null default now()
);

-- ---- analises_juridicas -----------------------------------------------------
-- Uma linha por minuta de contrato recebida. status controla o kanban:
--   nova -> processando -> aguardando_aprovacao -> aprovada | rejeitada
-- `risco_geral` (baixo/medio/alto) so e preenchida depois do processamento.
create table analises_juridicas (
  id_analise      text primary key,          -- AJ001, AJ002, ...
  contraparte     text not null,
  tipo_contrato   text not null,             -- fornecimento, cliente, representacao_comercial, locacao, prestacao_servicos, transporte, nda, outro
  texto_minuta    text not null,
  valor_envolvido numeric(15,2),
  risco_geral     text,
  status          text not null default 'nova',
  criado_em       timestamptz not null default now()
);

create index idx_analises_status on analises_juridicas (status);
create index idx_analises_contraparte on analises_juridicas (contraparte);

-- ---- clausulas_analisadas -------------------------------------------------------
-- Uma linha por clausula de risco encontrada na minuta (ou por tema esperado
-- que esta faltando, com texto_clausula null). O Investigador roda uma vez por
-- linha e grava a analise. status:
--   nova -> investigando -> aguardando_aprovacao -> resolvida
create table clausulas_analisadas (
  id                  uuid primary key default gen_random_uuid(),
  id_analise          text not null references analises_juridicas(id_analise) on delete cascade,
  tema                text not null,
  texto_clausula      text,                  -- null quando e um tema ausente
  classificacao_risco text,                  -- alinhada | ajuste | inaceitavel
  analise             jsonb,
  status              text not null default 'nova',
  criado_em           timestamptz not null default now()
);

create index idx_clausulas_analise on clausulas_analisadas (id_analise);
create index idx_clausulas_status  on clausulas_analisadas (status);

-- ---- Realtime (kanban e organograma atualizam sozinhos) -----------------
alter publication supabase_realtime add table analises_juridicas;
alter publication supabase_realtime add table clausulas_analisadas;

-- ---- RLS (mesma postura do SPEC secao 8: leitura/escrita so para a area) -----
-- Usa as funcoes auxiliares ja existentes no banco: eh_admin() e tem_area(area).
alter table clausulas_padrao      enable row level security;
alter table analises_juridicas    enable row level security;
alter table clausulas_analisadas  enable row level security;

create policy juridico_clausulas_padrao on clausulas_padrao
  for all using (tem_area('juridico') or eh_admin())
  with check (eh_admin());

create policy juridico_analises on analises_juridicas
  for all using (tem_area('juridico'))
  with check (tem_area('juridico'));

create policy juridico_clausulas_analisadas on clausulas_analisadas
  for all using (tem_area('juridico'))
  with check (tem_area('juridico'));

-- ---- Liberar a area Juridico para o seu usuario admin -----------------------
-- Troque o e-mail. So adiciona 'juridico' se ainda nao estiver na lista.
update perfis
   set areas = array_append(areas, 'juridico')
 where email = 'seu-email@exemplo.com'
   and not ('juridico' = any(areas));

-- ============================================================================
-- OPCIONAL — 3 minutas de exemplo para testar na tela sem digitar contrato.
-- Rode este bloco depois de importar clausulas_padrao.csv.
-- ============================================================================
-- insert into analises_juridicas (id_analise, contraparte, tipo_contrato, valor_envolvido, texto_minuta) values
-- ('AJ001', 'Metalurgica Vale do Aco Ltda', 'fornecimento', 48000.00,
--  E'CONTRATO DE FORNECIMENTO DE INSUMOS\n\nCLAUSULA 1 - OBJETO. Fornecimento de fixadores e vedacoes conforme pedidos.\n\nCLAUSULA 2 - PRECOS E REAJUSTE. Precos fixos por 12 meses, reajuste anual pelo IPCA.\n\nCLAUSULA 3 - PAGAMENTO. Pagamento em 28 dias da emissao da nota fiscal. Multa de 2% e juros de 1% ao mes em caso de atraso.\n\nCLAUSULA 4 - ENTREGA. Prazo de entrega de 10 dias uteis.\n\nCLAUSULA 5 - FORO. Fica eleito o foro da comarca de Betim/MG.'),
-- ('AJ002', 'RepreSul Representacoes', 'representacao_comercial', 0,
--  E'CONTRATO DE REPRESENTACAO COMERCIAL\n\nCLAUSULA 1 - OBJETO. Representacao dos produtos da contratante na regiao Sul.\n\nCLAUSULA 2 - EXCLUSIVIDADE. A contratante concede exclusividade total de zona a representada, sem qualquer contrapartida de volume minimo.\n\nCLAUSULA 3 - RESCISAO. A contratante nao podera rescindir o contrato em nenhuma hipotese antes de 60 meses.\n\nCLAUSULA 4 - RESPONSABILIDADE. A contratante respondera de forma ilimitada por quaisquer perdas e danos alegados pela representada.\n\nCLAUSULA 5 - FORO. Fica eleito o foro da comarca de Porto Alegre/RS.'),
-- ('AJ003', 'TransRapido Logistica S.A.', 'transporte', 15000.00,
--  E'CONTRATO DE PRESTACAO DE SERVICOS DE TRANSPORTE\n\nCLAUSULA 1 - OBJETO. Transporte rodoviario de cargas da contratante.\n\nCLAUSULA 2 - PAGAMENTO. Pagamento em 45 dias. Multa moratoria de 10% sobre o valor em atraso.\n\nCLAUSULA 3 - RESPONSABILIDADE POR AVARIAS. A transportadora nao se responsabiliza por avarias, extravios ou atrasos, seja qual for a causa.\n\nCLAUSULA 4 - FORO. Fica eleito o foro da comarca de Betim/MG.');
