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
-- ============================================================================

create or replace function eh_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
      and papel = 'admin'
  );
$$;

create or replace function tem_area(area text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
      and (papel = 'admin' or area = any(areas))
  );
$$;

-- Deixe o PostgREST/anon e o usuario logado executarem as funcoes.
grant execute on function eh_admin() to anon, authenticated;
grant execute on function tem_area(text) to anon, authenticated;
