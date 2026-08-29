-- ============================================================================
-- Modulo RH (POC) — colaboradores e faixas salariais
--
-- Rode este bloco UMA vez no SQL Editor do Supabase. Depois importe os CSVs
-- de dados/colaboradores.csv e dados/faixas_salariais.csv pelo Table Editor
-- (Import data -> "Use empty string as NULL" ligado, para a coluna `inicio`).
--
-- `execucoes_agentes` e `aprovacoes` NAO mudam: as colunas `area` e
-- `item_tipo` ja sao text livre. O modulo RH grava area='rh',
-- item_tipo='faixa', item_id = id_faixa (ex.: FX009).
-- ============================================================================

-- ---- colaboradores -------------------------------------------------------
create table colaboradores (
  id_colaborador text primary key,           -- COL001, COL002, ...
  nome           text not null,
  email          text not null,
  telefone       text,
  criado_em      timestamptz not null default now()
);

-- ---- faixas_salariais --------------------------------------------------------
-- Uma linha por proposta de salario. status controla o kanban:
--   nova -> processando -> aguardando_aprovacao -> aprovada | rejeitada
-- `inicio` (vigencia) so e preenchida quando a faixa e aprovada.
-- O salario atual de um colaborador = a ultima faixa com status 'aprovada'.
create table faixas_salariais (
  id_faixa       text primary key,           -- FX001, FX002, ...
  id_colaborador text not null references colaboradores(id_colaborador),
  valor          numeric(12,2) not null,
  inicio         date,
  status         text not null default 'nova',
  justificativa  text,
  criado_em      timestamptz not null default now()
);

create index idx_faixas_colaborador on faixas_salariais (id_colaborador);
create index idx_faixas_status      on faixas_salariais (status);

-- ---- Realtime (kanban atualiza sozinho, como em vendas) -----------------
alter publication supabase_realtime add table colaboradores;
alter publication supabase_realtime add table faixas_salariais;

-- ---- Liberar a area RH para o seu usuario admin ------------------------------
-- Troque o e-mail. So adiciona 'rh' se ainda nao estiver na lista.
update perfis
   set areas = array_append(areas, 'rh')
 where email = 'seu-email@exemplo.com'
   and not ('rh' = any(areas));
