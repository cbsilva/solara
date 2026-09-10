# SQL — Solara OS

Scripts para criar o schema do Solara OS no Supabase (SQL Editor → New query → colar → Run).

## Ordem de execução (banco novo)

Rode nesta ordem. **O passo 1 é obrigatório antes de qualquer módulo** — as políticas RLS
dependem das funções `eh_admin()` e `tem_area(area)`; sem elas o `create policy` falha e,
como o SQL Editor roda tudo numa transação, o `create table` junto é revertido.
(Os arquivos de módulo também recriam essas funções no topo, de forma idempotente, então
rodar um módulo isolado num banco novo também funciona.)

| # | Arquivo | O que cria |
|---|---|---|
| 1 | `00_funcoes_auth.sql` | funções `eh_admin()` e `tem_area(area)` |
| 2 | `criar_tabelas.sql` | `execucoes_agentes`, `aprovacoes`, `extratos_importados`, `lancamentos`, `divergencias`, `perfis_usuario` |
| 3 | `rh.sql` | `colaboradores`, `faixas_salariais` |
| 4 | `juridico.sql` | `clausulas_padrao`, `analises_juridicas`, `clausulas_analisadas` |
| 5 | `operacoes.sql` | `fornecedores`, `parametros_estoque`, `ciclos_reposicao`, `itens_ruptura` |

`perfis` e as tabelas do ERP (`clientes`, `produtos`, `pedidos_orcamento`, `titulos_receber`,
`extrato_bancario`) já devem existir (importadas dos CSVs de `dados/`).

Depois de rodar cada módulo, importe os CSVs de referência pelo Table Editor (ou use os
blocos `insert` de exemplo comentados no fim de `juridico.sql` / `operacoes.sql`) e libere a
área para o seu usuário (`update perfis set areas = array_append(...)` no fim de cada arquivo,
trocando o e-mail) ou pela tela `/admin`.

## Conferir se aplicou

No SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

select proname from pg_proc
where proname in ('eh_admin', 'tem_area');
```

Se `fornecedores`, `parametros_estoque`, `ciclos_reposicao`, `itens_ruptura` não
aparecerem, o `operacoes.sql` foi revertido — rode o `00_funcoes_auth.sql` e rode o
`operacoes.sql` de novo, olhando a aba **Results** por mensagens de erro.

## Retenção

`execucoes_agentes` é append-only e tem escrita pesada. Limpe periodicamente
(bloco `pg_cron` comentado no fim de `operacoes.sql`), ou manualmente:

```sql
delete from execucoes_agentes where inicio < now() - interval '7 days';
```
