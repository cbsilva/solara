-- ============================================================================
-- Funcoes auxiliares de autorizacao — RODE ISTO PRIMEIRO
--
-- Todas as politicas RLS do Solara OS dependem destas duas funcoes. Se o banco
-- for recriado, rode este arquivo ANTES de qualquer outro *.sql de modulo,
-- senao os blocos `create policy ...` falham com
-- "function tem_area(text) does not exist" e, como o SQL Editor roda tudo em
-- uma transacao, o `create table` junto e revertido.
--
-- Sao `security definer` para conseguirem ler `perfis` mesmo com RLS ligado
-- naquela tabela. `stable` porque o resultado nao muda dentro da query.
--
-- IMPORTANTE: o parametro de `tem_area` se chama `area_requerida` (nao `area`).
-- Ja existem +20 politicas RLS no banco dependendo desta assinatura, entao
-- `create or replace` NAO pode renomear o parametro (erro 42P13). Se algum dia
-- precisar mudar o nome, e `drop function tem_area(text) cascade` + recriar
-- todas as politicas — nao vale a pena. Todas as chamadas sao posicionais
-- (`tem_area('juridico')`), entao o nome do parametro e so cosmetico.
-- ============================================================================

create or replace function eh_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select papel = 'admin' from perfis where id = auth.uid();
$$;

create or replace function tem_area(area_requerida text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select area_requerida = any(areas) from perfis where id = auth.uid();
$$;

-- Deixe o PostgREST/anon e o usuario logado executarem as funcoes.
grant execute on function eh_admin() to anon, authenticated;
grant execute on function tem_area(text) to anon, authenticated;

-- NOTA: a funcao eh_demo() (usuario "admin sem poderes") fica em
-- sql/perfis_demo.sql, porque ela depende da coluna perfis.demo, que so
-- existe depois de rodar aquele arquivo. Nao mova a definicao pra ca sem
-- tambem mover o `alter table perfis add column demo` pra antes dela.
