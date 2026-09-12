-- ============================================================================
-- Modulo Operacoes (POC) — reposicao de estoque
--
-- Rode este bloco UMA vez no SQL Editor do Supabase. Depois:
--   1) importe dados/fornecedores.csv em `fornecedores` (ou use os INSERTs
--      de exemplo comentados no fim deste arquivo);
--   2) importe dados/parametros_estoque.csv em `parametros_estoque` (idem).
--
-- `execucoes_agentes` e `aprovacoes` NAO mudam: as colunas `area` e
-- `item_tipo` ja sao text livre. O modulo Operacoes grava area='operacoes',
-- item_tipo='ruptura' (organograma/execucoes) e item_tipo='ordem' (fila),
-- item_id = id_ciclo (ex.: CR001).
-- ============================================================================

-- ---- Pre-requisito: funcoes de autorizacao (idempotente) -----------------
-- Repetido aqui para o arquivo rodar sozinho num banco recem-criado. Fonte
-- canonica: sql/00_funcoes_auth.sql. O parametro de tem_area e `area_requerida`
-- (nao renomear: +20 politicas RLS dependem da assinatura tem_area(text)).
create or replace function eh_admin()
  returns boolean language sql stable security definer set search_path = public
as $$ select papel = 'admin' from perfis where id = auth.uid(); $$;

create or replace function tem_area(area_requerida text)
  returns boolean language sql stable security definer set search_path = public
as $$ select area_requerida = any(areas) from perfis where id = auth.uid(); $$;

grant execute on function eh_admin() to anon, authenticated;
grant execute on function tem_area(text) to anon, authenticated;

-- ---- fornecedores (referencia) --------------------------------------------
create table fornecedores (
  cod_fornecedor      text primary key,          -- FOR001, FOR002, ...
  nome                text not null,
  prazo_entrega_dias  int,
  pedido_minimo_valor numeric(12,2) not null default 0,
  homologado          boolean not null default false,
  observacao          text,
  criado_em           timestamptz not null default now()
);

-- ---- parametros_estoque (referencia, uma linha por produto de `produtos`) --
create table parametros_estoque (
  cod_produto                 text primary key,   -- referencia logica a produtos.cod_produto
  ponto_reposicao             int not null default 0,
  estoque_maximo              int not null default 0,
  consumo_medio_mensal        numeric(12,2) not null default 0,
  cod_fornecedor_preferencial text,
  criado_em                   timestamptz not null default now()
);

-- ---- ciclos_reposicao (o lote; analogo a extratos_importados) --------------
--   novo -> planejando -> aguardando_aprovacao -> concluido
create table ciclos_reposicao (
  id_ciclo       text primary key,               -- CR001, CR002, ...
  disparado_em   timestamptz not null default now(),
  disparado_por  uuid,
  total_rupturas int not null default 0,
  status         text not null default 'novo'
);

-- ---- itens_ruptura (analogo a divergencias) -------------------------------
--   novo -> investigando -> aguardando_aprovacao -> resolvido
create table itens_ruptura (
  id              uuid primary key default gen_random_uuid(),
  id_ciclo        text not null references ciclos_reposicao(id_ciclo) on delete cascade,
  cod_produto     text not null,
  estoque_atual   int,
  ponto_reposicao int,
  cobertura_dias  numeric(10,1),
  analise         jsonb,
  status          text not null default 'novo',
  criado_em       timestamptz not null default now()
);

create index idx_itens_ruptura_ciclo  on itens_ruptura (id_ciclo);
create index idx_itens_ruptura_status on itens_ruptura (status);

-- ---- Realtime (o kanban de rupturas e o organograma atualizam sozinhos) ---
-- Custo: toda escrita nestas tabelas e transmitida a cada aba aberta. Se o
-- consumo de Realtime apertar, o candidato a sair da publicacao e
-- `itens_ruptura` (o kanban pode passar a recarregar sob demanda).
alter publication supabase_realtime add table ciclos_reposicao;
alter publication supabase_realtime add table itens_ruptura;

-- ---- RLS (mesma postura do SPEC secao 10) --------------------------------
-- Usa as funcoes auxiliares ja existentes no banco: eh_admin() e tem_area(area).
alter table fornecedores       enable row level security;
alter table parametros_estoque enable row level security;
alter table ciclos_reposicao   enable row level security;
alter table itens_ruptura      enable row level security;

create policy operacoes_fornecedores on fornecedores
  for all using (tem_area('operacoes') or eh_admin())
  with check (eh_admin());

create policy operacoes_parametros_estoque on parametros_estoque
  for all using (tem_area('operacoes') or eh_admin())
  with check (eh_admin());

create policy operacoes_ciclos on ciclos_reposicao
  for all using (tem_area('operacoes'))
  with check (tem_area('operacoes'));

create policy operacoes_itens_ruptura on itens_ruptura
  for all using (tem_area('operacoes'))
  with check (tem_area('operacoes'));

-- ---- Liberar a area Operacoes para o seu usuario admin --------------------
-- Troque o e-mail. So adiciona 'operacoes' se ainda nao estiver na lista.
update perfis
   set areas = array_append(areas, 'operacoes')
 where email = 'seu-email@exemplo.com'
   and not ('operacoes' = any(areas));

-- ============================================================================
-- RETENCAO de execucoes_agentes (opcional, mas recomendado)
--
-- `execucoes_agentes` e append-only, tem escrita pesada (varias linhas por
-- ciclo/analise/conciliacao) e Realtime ligado. Sem limpeza ela cresce sem
-- parar e domina o custo do banco. Rode este DELETE de vez em quando, ou
-- agende com pg_cron (extensao "pg_cron" no painel):
--
--   select cron.schedule(
--     'limpa-execucoes-agentes', '0 3 * * *',
--     $$ delete from execucoes_agentes where inicio < now() - interval '7 days' $$
--   );
--
-- Manual, quando quiser:
--   delete from execucoes_agentes where inicio < now() - interval '7 days';
-- ============================================================================

-- ============================================================================
-- OPCIONAL — dados de exemplo (dispensam os CSVs). Ajustados para gerar
-- rupturas em P002, P005, P008, P010, P011, P017 no estado atual de `produtos`.
-- ============================================================================
-- insert into fornecedores (cod_fornecedor, nome, prazo_entrega_dias, pedido_minimo_valor, homologado, observacao) values
-- ('FOR001', 'Fixadores Gerais Ltda',        5,  300.00, true,  'Parafusos, porcas, arruelas, chumbadores'),
-- ('FOR002', 'Vedacoes e Cia',               7,  500.00, true,  'O-rings, retentores, juntas'),
-- ('FOR003', 'CorreiaBelt Distribuidora',   10,  800.00, true,  'Correias em V e dentadas'),
-- ('FOR004', 'LubriMinas',                   5, 1000.00, true,  'Oleos e graxas'),
-- ('FOR005', 'EPI Sul',                      4,  400.00, true,  'Equipamentos de protecao'),
-- ('FOR006', 'ImportPecas Trading',         20,  600.00, false, 'Fornecedor em homologacao — nao usar sem aprovacao');
--
-- insert into parametros_estoque (cod_produto, ponto_reposicao, estoque_maximo, consumo_medio_mensal, cod_fornecedor_preferencial) values
-- ('P001', 200,  800, 260, 'FOR001'),
-- ('P002', 150,  600, 220, 'FOR001'),   -- estoque 20  -> ruptura
-- ('P003', 300, 1500, 500, 'FOR001'),
-- ('P004', 120,  500, 140, 'FOR001'),
-- ('P005',  60,  240,  90, 'FOR001'),   -- estoque 0   -> ruptura
-- ('P006', 200,  800, 180, 'FOR002'),
-- ('P007',  50,  200,  40, 'FOR002'),
-- ('P008',  40,  160,  35, 'FOR002'),   -- estoque 30  -> ruptura
-- ('P009',  50,  200,  45, 'FOR003'),
-- ('P010',  40,  160,  38, 'FOR003'),   -- estoque 12  -> ruptura
-- ('P011',  20,   90,  18, 'FOR003'),   -- estoque 8   -> ruptura
-- ('P012',  30,  120,  25, 'FOR004'),
-- ('P013',  60,  240, 110, 'FOR004'),
-- ('P014',  80,  320, 130, 'FOR004'),
-- ('P015', 150,  600, 300, 'FOR005'),
-- ('P016', 100,  400,  90, 'FOR005'),
-- ('P017',  50,  200,  40, 'FOR005'),   -- estoque 45  -> ruptura
-- ('P018',  40,  160,  35, 'FOR005'),
-- ('P019', 300, 1200, 400, 'FOR005'),
-- ('P020',  60,  250, 120, 'FOR006');   -- fornecedor preferencial NAO homologado (testa a checagem)
