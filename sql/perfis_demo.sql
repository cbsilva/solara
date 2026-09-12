-- ============================================================================
-- Usuario "demo" — admin sem poderes
--
-- Objetivo: alguem com papel = 'admin' (por isso navega em qualquer tela,
-- inclusive /admin) mas que nao pode executar nenhuma acao de administrador
-- de verdade: criar/editar usuario, nem ligar/desligar o uso de agentes de
-- outra pessoa (aba "Permissoes de Agentes").
--
-- Rode depois de 00_funcoes_auth.sql e criar_tabelas.sql (precisa que
-- `perfis` e `perfis_usuario` ja existam).
-- ============================================================================

-- 1) Coluna que marca a conta como demo. Continua com papel = 'admin'.
alter table perfis add column if not exists demo boolean not null default false;

-- 2) Funcao auxiliar, no mesmo estilo de eh_admin()/tem_area() (00_funcoes_auth.sql).
create or replace function eh_demo()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(demo, false) from perfis where id = auth.uid();
$$;

grant execute on function eh_demo() to anon, authenticated;

-- 3) RLS em perfis_usuario (a tabela que a aba "Permissoes de Agentes" altera
-- direto do navegador, via supabase-js, sem passar por rota de API). Antes
-- desta migracao a tabela nao tinha RLS habilitado.
alter table perfis_usuario enable row level security;

-- Qualquer admin (real ou demo) pode ver a lista, para a tela renderizar.
create policy perfis_usuario_leitura on perfis_usuario
  for select using (eh_admin());

-- So admin de verdade (nao demo) pode ligar/desligar o uso de agentes.
create policy perfis_usuario_escrita on perfis_usuario
  for insert with check (eh_admin() and not eh_demo());

create policy perfis_usuario_atualizacao on perfis_usuario
  for update using (eh_admin() and not eh_demo())
  with check (eh_admin() and not eh_demo());

-- ---- Marcar um usuario existente como demo -------------------------------
-- Troque o e-mail. O usuario precisa ja existir em `perfis` com papel = 'admin'
-- e as areas que ele deve poder navegar (normalmente todas).
-- update perfis set demo = true where email = 'demo@solara.com.br';
