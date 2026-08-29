# Design System — Solara OS

Baseado no sistema visual do portal B2B da Quanthyx (paleta "argila" / *Warm Clean*):
off-white quente, um acento terracota, bordas hairline, sombra mínima, tipografia Inter.

## Arquivos

| Arquivo | Papel |
|---|---|
| `app/tokens.css` | Tokens: primitivos → semânticos → escalares. Modo claro (canônico) + escuro. |
| `app/globals.css` | Reset + vocabulário de componentes (`.btn`, `.card`, `.badge`, `.tabela`, `.aviso`, `.topo`, `.kanban`, `.drawer`, `.fila`, `.organograma`…). Importa `tokens.css`. |
| `components/Icon.tsx` | Ícones Lucide (ISC) como SVG inline. Traço e cor herdam do CSS (`.ico`). |
| `components/Header.tsx` | `.topo` — cabeçalho fixo com marca clicável, ações e alternador de tema. |
| `components/ThemeToggle.tsx` | Alterna `data-theme` no `<html>` e persiste em `localStorage`. |

## Tokens (usar SEMPRE os semânticos)

**Superfícies:** `--bg` `--bg-subtle` `--surface` `--surface-sunken` `--surface-nav` `--overlay`
**Texto:** `--text-strong` `--text` `--text-muted` `--text-faint` `--text-on-accent`
**Bordas:** `--border` `--border-strong` `--border-input`
**Acento:** `--accent` `--accent-hover` `--accent-active` `--accent-text` `--accent-soft` `--accent-border` `--ring`
**Estados:** `--success(-text/-soft)` `--warning(...)` `--danger(...)` `--info(-soft)`
**Sombra:** `--shadow-xs/sm/md/lg` (elevação por cor, não por peso)

### Cores base (modo claro, "argila")
- Fundo app `#f4f2ec` · card `#ffffff` · texto forte `#1a1a18`
- Acento terracota `#cc785c` (hover `#b5654a`, texto `#9c543c`)
- Borda hairline `#e8e5dd`

O modo escuro troca para a família *espresso*; nenhuma cor tem definição única
dentro de `@media`/`[data-theme]` — o token claro é a fonte.

## Escalares

- **Tipografia:** Inter (UI), JetBrains Mono (códigos/valores). `--fs-display 32 · h1 24 · h2 18 · h3 16 · body 14 · sm 13 · xs 11`
- **Espaço:** escala 4px — `--sp-1..--sp-12`
- **Raio:** `--r-xs 4 · sm 6 · md 10 · lg 14 · pill 999`
- **Layout:** `--header-h 56 · content-max 1240`
- **Transição:** `--t-fast 120ms · --t 180ms · --t-slow 280ms`

## Componentes

| Classe | Uso |
|---|---|
| `.btn` + `--primary` `--secondary` `--ghost` `--danger`, `--sm` `--lg` `--block` | botões (altura 40, raio md) |
| `.field` > `label` + `.input` / `.select` (em `.select-wrap` com chevron) / `textarea.input` | formulários; foco com anel `--ring` |
| `.badge` + `--neutral` `--success` `--warning` `--danger` `--info` `--promo` | etiquetas pill |
| `.card` + `.card-head` `.card-body` `.card-foot` | superfície elevada |
| `.aviso` + `--erro` `--ok` `--aviso` | alertas inline |
| `.tabela-wrap` > `.tabela` | tabelas (cabeçalho caixa-alta, zebra, hover) |
| `.tabs` > `.tab.is-ativo` | navegação por abas |
| `.spinner` (`--lg`) · `.carregando-tela` | carregamento |
| `.tema-btn` | botão do alternador de tema |
| `.kanban` > `.coluna` > `.cartao` | quadro de vendas |
| `.drawer` + `.drawer-scrim` `.drawer-head` | painel lateral de detalhe |
| `.organograma` · `.linha-tempo` · `.fila` | componentes do Motor |
| `.area-card` (grade `.areas-grade`) | cartões da home |

## Telas migradas

- ✅ `/login` — split editorial + formulário
- ✅ `/` — grade de áreas
- ✅ `/vendas` — cabeçalho de tela, abas, kanban, drawer com linha do tempo
- ✅ `/rh` — mesmo padrão de `/vendas`: abas (Faixas salariais / Colaboradores / Aprovações), kanban de faixas, tabela de colaboradores, drawer
- ✅ `/admin` — formulário + tabela
- ✅ `/financeiro` — abas, dropzones, antes/depois, cards de resultado, relatório
- ✅ `components/Organograma`, `FilaAprovacao`, `LinhaDoTempo`

## Tema claro/escuro

O `<html>` recebe `data-theme="light|dark"` via `ThemeToggle` (persistido em
`localStorage`). Sem atributo, segue `prefers-color-scheme`. Toda cor da UI vem
de token semântico, então a troca é instantânea e sem retrabalho por tela.
