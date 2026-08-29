# SQL - Criação de Tabelas

Este arquivo contém os scripts SQL para criar as tabelas do Solara OS no Supabase.

## Como usar

1. Abra o [Painel Supabase](https://supabase.com/dashboard)
2. Vá em **SQL Editor**
3. Clique em **New query**
4. Copie o conteúdo de `criar_tabelas.sql`
5. Cole na query
6. Clique em **Run**

## Tabelas

### `execucoes_agentes`

Registra toda execução de um agente de IA.

- Cada chamada de agente cria uma linha com `status = rodando`
- Quando o agente termina, atualiza com `status = ok` ou `status = erro`
- Realtime habilitado (Database → Replication)

### `aprovacoes`

Fila de itens aguardando aprovação de um operador.

- Um item fica em `status = pendente` até ser decidido
- Operador pode aprovar (`status = aprovada`), editar e aprovar (`status = editada`), ou rejeitar (`status = rejeitada`)
- Realtime habilitado

## Dependências

As tabelas dependem de:
- `auth.users` (Supabase Auth)
- `perfis` (já deve existir)

Se `perfis` não existir, execute este SQL primeiro:

```sql
CREATE TABLE perfis (
  id UUID = auth.users.id,
  email TEXT,
  nome TEXT,
  papel TEXT,
  areas TEXT[],
  criado_em TIMESTAMPTZ DEFAULT now()
);
```
