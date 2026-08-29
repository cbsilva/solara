# Solara OS

Sistema de gestão da Solara Distribuidora. Agentes de IA fazem a parte repetitiva
de **Vendas** (pedidos de orçamento), **Financeiro** (conciliação bancária) e
**RH** (alteração de faixa salarial); as pessoas aprovam. Nenhuma decisão de
negócio sai do sistema sem aprovação humana, e toda execução de agente fica
registrada (quem, o quê, quando, quanto custou).

## Stack

- **Next.js 15** (App Router) + **TypeScript** — deploy na Vercel
- **Supabase** — Auth (e-mail/senha), Postgres, Realtime
- **API Anthropic** pelo SDK oficial — modelo `claude-sonnet-4-6`
- CSS próprio com design tokens (sem biblioteca de UI pesada)

## Estrutura

```
solara-os/
├── app/
│   ├── tokens.css                 # design tokens (cor, tipografia, espaço)
│   ├── globals.css                # vocabulário de componentes (.btn, .card, .tabela…)
│   ├── layout.tsx                 # fontes (Inter, JetBrains Mono) + metadata
│   ├── page.tsx                   # / — menu de áreas (protegido)
│   ├── login/page.tsx             # /login
│   ├── admin/page.tsx             # /admin — CRUD de usuários (só admin)
│   ├── vendas/page.tsx            # /vendas — kanban de pedidos
│   ├── financeiro/page.tsx        # /financeiro — importar e conciliar extrato
│   ├── rh/page.tsx                # /rh — colaboradores + kanban de faixas salariais
│   └── api/
│       ├── admin/criar-usuario/route.ts
│       ├── vendas/processar/route.ts        # maxDuration = 60
│       ├── financeiro/conciliar/route.ts    # maxDuration = 60
│       └── rh/processar/route.ts            # maxDuration = 60
├── components/
│   ├── Header.tsx                 # .topo — cabeçalho fixo, marca clicável, tema
│   ├── ThemeToggle.tsx            # alterna claro/escuro (data-theme + localStorage)
│   ├── Icon.tsx                   # ícones Lucide inline
│   ├── Organograma.tsx            # execução dos agentes em tempo real (Realtime)
│   ├── FilaAprovacao.tsx          # fila de aprovação (Aprovar / Editar / Rejeitar)
│   └── LinhaDoTempo.tsx           # execuções de um item, com entrada/saída
├── lib/
│   ├── supabase/{client,server}.ts
│   ├── agente.ts                  # ÚNICA porta para a API Anthropic
│   ├── orquestradores/{vendas,financeiro,rh}.ts  # orquestração é código comum
│   └── financeiro/{limpar,casar}.ts             # limpeza e casamento determinísticos
├── prompts/
│   ├── vendas/{triador,pesquisador,redator,revisor}.md
│   ├── financeiro/{investigador,consolidador,revisor}.md
│   └── rh/{triador,pesquisador,redator,revisor}.md
├── sql/
│   ├── criar_tabelas.sql         # tabelas do Motor + Financeiro (com Realtime)
│   └── rh.sql                    # tabelas colaboradores + faixas_salariais
├── dados/                        # CSVs de carga (ERP + colaboradores/faixas do RH)
├── PRD.md · SPEC.md · SPEC-DESIGN.md · DESIGN.md · CLAUDE.md
```

## Setup local

1. **Dependências**
   ```bash
   npm install
   ```

2. **Variáveis de ambiente** — crie `.env.local` a partir de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (service role — só no servidor)
   - `ANTHROPIC_API_KEY`

3. **Tabelas** — no [painel Supabase](https://supabase.com/dashboard) → SQL Editor:
   - `sql/criar_tabelas.sql` — `execucoes_agentes`, `aprovacoes`,
     `extratos_importados`, `lancamentos`, `divergencias` (todas com Realtime).
   - `sql/rh.sql` — `colaboradores` e `faixas_salariais`; depois importe
     `dados/colaboradores.csv` e `dados/faixas_salariais.csv` pelo Table Editor
     (para `faixas_salariais`, ligue "Use empty string as NULL" por causa de `inicio`).

   As tabelas do ERP (`clientes`, `produtos`, `pedidos_orcamento`,
   `titulos_receber`, `extrato_bancario`) já existem, importadas de `dados/`.

4. **Primeiro usuário (admin)** — crie em Authentication → Users e depois:
   ```sql
   INSERT INTO perfis (id, email, nome, papel, areas)
   SELECT id, email, email, 'admin', ARRAY['vendas','financeiro','rh']
   FROM auth.users WHERE email = 'voce@exemplo.com';
   ```

5. **Rodar**
   ```bash
   npm run dev      # http://localhost:3000
   ```

## Como funciona

### Vendas (`/vendas`)
Kanban de `pedidos_orcamento` (`novo → processando → aguardando_aprovacao →
respondido / rejeitado`). **Processar** dispara `POST /api/vendas/processar`, que
roda o orquestrador: **Triador** (classifica) → **Pesquisador** (casa itens ao
catálogo) → **Redator** (escreve a resposta) → **Revisor** (checa regras, até 2
voltas). O resultado vira um item na fila de aprovação. A Marcela aprova, edita
ou rejeita.

### Financeiro (`/financeiro`)
Upload do extrato (CSV bruto ou limpo) → `limpar.ts` normaliza → `casar.ts` casa
créditos com títulos (NF, valor+vencimento, soma de dois, duplicidade). O que não
bate vira divergência. **Investigar** dispara `POST /api/financeiro/conciliar`:
**Investigador** (um por divergência, em paralelo) → **Consolidador** (relatório)
→ **Revisor**. Cada hipótese vai para a fila. O Rafael aceita, corrige ou rejeita.

### RH (`/rh`)
Duas frentes. **Colaboradores**: cadastro simples (nome, e-mail, telefone), sem
agentes. **Faixas salariais**: kanban de `faixas_salariais` (`nova → processando →
aguardando_aprovacao → aprovada / rejeitada`). **Processar** dispara
`POST /api/rh/processar`: **Triador** (é alteração salarial?) → **Pesquisador**
(busca o colaborador e a última faixa aprovada, calcula a variação %) → **Redator**
(justificativa formal) → **Revisor** (teto de variação e intervalo mínimo, até 2
voltas). A proposta vai para a fila; aprovar grava `status = aprovada` e
`inicio = hoje` (a vigência). O salário atual de um colaborador é a última faixa
aprovada.

### Motor (comum às três áreas)
- `lib/agente.ts` — única função que chama a Anthropic. Grava em
  `execucoes_agentes` no início (`rodando`) e no fim (`ok`/`erro`), com entrada,
  saída, tokens e tempo. O system prompt vem de `prompts/<area>/<papel>.md`.
- `components/Organograma` — assina `execucoes_agentes` por Realtime e desenha os
  agentes: cinza (sem execução), pulsando (`rodando`), sólido (`ok`, com tempo e
  tokens), vermelho (`erro`).
- `components/FilaAprovacao` e `LinhaDoTempo` — mesmos componentes nas três áreas.
  Ao decidir, a fila reflete no item de origem: pedido → `respondido`/`rejeitado`,
  faixa → `aprovada`/`rejeitada`.

## Design

Interface baseada no design system do portal B2B da Quanthyx (paleta "argila":
off-white quente, acento terracota, bordas hairline, sombra mínima, Inter).
Tokens em `app/tokens.css`, componentes em `app/globals.css`. Tema claro/escuro
pelo botão no cabeçalho (`data-theme` no `<html>`, persistido em `localStorage`).
Ver [SPEC-DESIGN.md](./SPEC-DESIGN.md) e [DESIGN.md](./DESIGN.md).

## Scripts

```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npm start        # servir o build
npm run lint
```

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [PRD.md](./PRD.md) | O problema e o resultado esperado, para pessoas |
| [SPEC.md](./SPEC.md) | Especificação técnica: Fundação, Casca, Motor, Vendas, Financeiro, Recursos Humanos |
| [SPEC-DESIGN.md](./SPEC-DESIGN.md) | Especificação de design: princípios, tokens, componentes, telas |
| [DESIGN.md](./DESIGN.md) | Referência rápida do design system |
| [CLAUDE.md](./CLAUDE.md) | Regras da casa (idioma, stack, convenções) |

## Deploy na Vercel

Conecte o repositório, configure as 4 variáveis de ambiente no painel e o deploy
é automático a cada push. Rotas que chamam agentes usam `export const maxDuration = 60`.

---

**Status:** Fundação, Casca, Motor, Vendas, Financeiro e RH implementados.
Interface no design system "argila", com tema claro/escuro.
