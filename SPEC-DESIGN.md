# SPEC-DESIGN — Solara OS

**O que o construtor precisa saber sobre a interface.** Este documento é o par
visual do SPEC.md. Cada seção descreve uma decisão de design e como ela vive no
código. Os nomes de token e classe são os que aparecem em `app/tokens.css` e
`app/globals.css`.

---

## 0. Visão geral

A interface é uma casca de aplicação: um cabeçalho fixo, uma faixa de conteúdo
centrada (máx. 1240px) e, dentro dela, telas que combinam **cartões**,
**tabelas**, **kanban**, **abas** e um **painel lateral** de detalhe.

Base visual: o design system do portal B2B da Quanthyx, paleta **"argila"**
(*Warm Clean*) — estrutura limpa de dashboard com o calor e a contenção de um
produto editorial. Um acento só (terracota), off-white quente, bordas hairline,
sombra quase imperceptível.

Duas camadas, como no SPEC técnico:

- **Tokens** (`app/tokens.css`): a fonte única de cor, tipografia, espaço, raio.
- **Componentes** (`app/globals.css`): o vocabulário de classes que as telas usam.

Nenhuma tela declara cor crua. Toda cor vem de um token semântico, e por isso o
tema claro/escuro é uma troca de atributo, sem retrabalho por tela.

---

## 1. Princípios

1. **Um acento, e só um.** Terracota (`--accent`) marca o que é acionável ou
   ativo. Verde, âmbar e vermelho são reservados para estado (ok, atenção, erro),
   nunca para decoração.
2. **Hierarquia por cor e peso, não por tamanho.** Títulos de tela em 24px;
   quase todo o resto em 14px. O que mudam são cor (`--text-strong` →
   `--text-muted` → `--text-faint`) e peso (600 / 500 / 400).
3. **Elevação por cor, não por sombra.** Cartão é superfície + borda hairline.
   Sombra (`--shadow-*`) é sutil e só entra em hover ou em camadas flutuantes
   (drawer, modal).
4. **Dado numérico é monoespaçado.** Código de pedido, valor em reais, tempo e
   tokens usam `--font-mono` para alinhar em coluna.
5. **A máquina prepara, a pessoa decide** — o mesmo princípio do produto vale na
   tela: o que um agente propõe aparece sempre num contêiner editável, com as
   ações de decisão (Aprovar / Editar / Rejeitar) juntas e visíveis.
6. **Sem emoji na interface.** Ícones são SVG Lucide (`components/Icon.tsx`),
   traço e cor herdados do CSS.

---

## 2. Tokens

### 2.1 Cor — usar SEMPRE os semânticos

| Grupo | Tokens |
|---|---|
| Superfície | `--bg` `--bg-subtle` `--surface` `--surface-2` `--surface-sunken` `--surface-nav` `--overlay` |
| Texto | `--text-strong` `--text` `--text-muted` `--text-faint` `--text-on-accent` `--text-on-danger` |
| Borda | `--border` `--border-strong` `--border-input` |
| Acento | `--accent` `--accent-hover` `--accent-active` `--accent-text` `--accent-soft` `--accent-soft-hover` `--accent-border` `--ring` |
| Estado | `--success` `--success-text` `--success-soft` · `--warning` … · `--danger` … · `--info` `--info-soft` |
| Sombra | `--shadow-xs` `--shadow-sm` `--shadow-md` `--shadow-lg` |

Cores base (modo claro): fundo `#f4f2ec`, cartão `#ffffff`, texto forte
`#1a1a18`, acento `#cc785c`, borda `#e8e5dd`.

Os primitivos (`--stone-*`, `--esp-*`, `--clay-*`, canais `--a-rgb`) existem só
para alimentar os semânticos. **Tela nenhuma referencia primitivo.**

### 2.2 Tema claro/escuro

- `<html>` sem atributo → segue `prefers-color-scheme`.
- `<html data-theme="dark">` / `data-theme="light"` → escolha explícita, vence o SO.
- O bloco escuro é escrito duas vezes (`@media` e `[data-theme="dark"]`) por
  especificidade; se mexer num, mexer no outro.
- `components/ThemeToggle.tsx` grava a escolha em `localStorage` (`tema`).

### 2.3 Escalares

| Eixo | Valores |
|---|---|
| Tipografia | `--font-sans` = Inter · `--font-mono` = JetBrains Mono |
| Tamanhos | display 32 · h1 24 · h2 18 · h3 16 · body 14 · sm 13 · xs 11 |
| Peso | regular 400 · medium 500 · semibold 600 · bold 700 |
| Espaço (escala 4px) | `--sp-1` 4 … `--sp-12` 48 |
| Raio | xs 4 · sm 6 · md 10 · lg 14 · pill 999 |
| Transição | `--t-fast` 120ms · `--t` 180ms · `--t-slow` 280ms |
| Layout | `--header-h` 56 · `--content-max` 1240 |

Escalar não muda com o tema. Identidade aqui é cor.

---

## 3. Componentes

Contrato de cada classe. Todas em `app/globals.css`.

### 3.1 Botão — `.btn`
Altura 40 (`--sm` 32, `--lg` 48), raio md, `gap` de 8 para o ícone.
Variantes: `--primary` (acento), `--secondary` (superfície + borda),
`--ghost` (texto de acento, fundo só no hover), `--danger`.
`--block` estica para 100%. `:disabled` = opacidade 0.5.

### 3.2 Campo — `.field` > `label` + `.input` / `.select` / `textarea.input`
Altura 40, raio md. Foco: borda de acento + anel `0 0 0 3px var(--ring)`.
`.select` vai dentro de `.select-wrap` com um `Icon type="chevron-baixo"`
posicionado à direita. `.input-icone` faz o mesmo com a lupa à esquerda.
`.is-error` pinta a borda de `--danger`. `.hint` / `.hint--error` abaixo.

### 3.3 Badge — `.badge`
Pill de 22px de altura. Variantes: `--neutral` `--success` `--warning`
`--danger` `--info` `--promo` (acento). `.dot` opcional herda a cor.

### 3.4 Cartão — `.card` + `.card-head` / `.card-body` / `.card-foot`
Superfície + borda + raio lg. `card-head` e `card-foot` separados por hairline;
`card-foot` alinha ações à direita.

### 3.5 Aviso — `.aviso` + `--erro` / `--ok` / `--aviso`
Alerta inline: ícone + texto, fundo `*-soft`, sem borda nas variantes de estado.

### 3.6 Tabela — `.tabela-wrap` > `.tabela`
`tabela-wrap` dá a casca (borda + raio + scroll-x). `th` em caixa-alta 11px com
`letter-spacing`; linhas zebradas (`nth-child(even)` = `--bg-subtle`); hover =
`--accent-soft-hover`; `.is-selected` = `--accent-soft`. Coluna numérica: `.num`
(alinha à direita, fonte mono).

### 3.7 Abas — `.tabs` > `.tab`
Linha de botões sobre um hairline. `.tab.is-ativo` = texto de acento + borda
inferior de acento.

### 3.8 Carregamento — `.spinner` (`--lg`) e `.carregando-tela`
`.carregando-tela` centraliza spinner + texto em `100vh` — usar enquanto a
sessão é verificada.

### 3.9 Estado vazio — `.estado-vazio`
Respiro generoso, texto em `--text-muted`, `<strong>` opcional em destaque.

### 3.10 Cabeçalho — `.topo` (componente `Header`)
Fixo, `backdrop-filter: blur`, hairline embaixo. `.marca` é `<Link href="/">`
(volta à home) com `.selo` (quadrado de acento com "S") e subtítulo `<small>` =
contexto da tela. `.topo-acoes`: e-mail do usuário (só em ≥900px), botão
**Início** (`mostraInicio`), botão **Admin** (`mostraAdmin`), **ThemeToggle**,
**Sair** (`mostraLogout`). Prop de texto do subtítulo: `contexto`.

### 3.11 Ícones — `components/Icon.tsx`
SVG Lucide inline. `<Icon type="…" size="sm|md|lg|xl" />`. Classe `.ico` define
traço (`stroke: currentColor`, width 2) e tamanho. Nunca embutir emoji.

---

## 4. Padrões de tela

### 4.1 Casca
```
<div class="pagina-app">
  <Header contexto="…" mostraInicio mostraLogout />
  <main class="app-main">        (máx 1240, padding 24)
    <h1 class="app-titulo"> + <p class="app-subtitulo">
    …conteúdo…
  </main>
  {drawer opcional}
</div>
```

### 4.2 Cabeçalho de tela — `.tela-cabecalho`
Título/subtítulo à esquerda, ação primária à direita. Quebra em coluna no mobile.

### 4.3 Formulário
Campos em `.form-grade` (2 colunas, `.field--larga` ocupa a linha). Em telas de
CRUD, o formulário mora num `.card`; as ações ficam no `.card-foot`.

### 4.4 Kanban — `.kanban` > `.coluna` > `.cartao`
5 colunas de largura mínima 220px; abaixo de 1100px vira rolagem horizontal.
`.coluna-head`: ponto colorido (cor por status via token) + rótulo + `.conta`.
`.cartao` mostra código (mono), cliente, canal/data e as primeiras linhas da
mensagem; `.is-selected` = borda de acento + anel. Botão de ação (ex.: Processar)
entra dentro do cartão, com `stopPropagation`.

### 4.5 Painel lateral — `.drawer` + `.drawer-scrim`
Flutua à direita (máx 400px), sombra lg, `.drawer-head` fixo com título e botão
`.icone-btn` de fechar. Abre ao selecionar um item do kanban; o scrim fecha.

### 4.6 Grade de áreas (home) — `.areas-grade` > `.area-card`
3 → 2 → 1 coluna. Cada cartão: `.icone-caixa` (acento-soft), título, descrição,
rodapé com `.badge` (Em breve / Sem acesso) ou `.avancar` ("Acessar" + chevron).
`:disabled` para áreas inativas ou sem acesso.

### 4.7 Login — `.entrar-layout`
Split: `.entrar-lateral` (painel de acento-soft com o pitch, some abaixo de
860px) + `.entrar-painel` (`.entrar-caixa`, máx 400px, com o formulário).
ThemeToggle no cabeçalho simplificado.

---

## 5. Componentes do Motor

### 5.1 Organograma — `.organograma`
Orquestrador no topo, `.org-conector` vertical, `.org-agentes` em linha. Cada
`.org-cartao` tem modificador por status:
- sem execução: `--vazio` (opacidade reduzida)
- `rodando`: `--rodando` (borda/fundo `--info`, animação `pulsar`)
- `ok`: `--ok` (verde), mostra `Ns · Nt`
- `erro`: `--erro` (vermelho)

`.org-haste.is-reprovado` fica `--danger` por 3s quando o Revisor devolve
`aprovado = false`.

### 5.2 Fila de aprovação — `.fila`
Duas colunas: `.fila-lista` (itens, com `.badge` de status e filtro "Apenas
pendentes") + `.fila-detalhe` (proposta em `textarea` mono, campo de observação,
`.fila-acoes` com Aprovar / Salvar edição e aprovar / Rejeitar). Abaixo de 720px
mostra só a lista.

### 5.3 Linha do tempo — `.linha-tempo`
Vive dentro do drawer. Lista `.lt-linha` com número, nome do agente + `.badge`,
metadados mono (hora · duração · tokens). Expandir abre `.lt-detalhe` com entrada
e saída em `.preview` (JSON) e o erro em `.aviso--erro`.

---

## 6. Acessibilidade

- `:focus-visible` global: contorno de 2px em `--accent`, offset 2px.
- Todo controle interativo é `<button>` ou `<a>`/`<Link>` — nada de `div`
  clicável.
- Alvos de toque ≥ 32px de altura (`.btn--sm`), 40px no padrão.
- Ícones decorativos levam `aria-hidden`; botões só de ícone levam `aria-label`.
- Contraste: texto normal cumpre AA sobre `--surface` e `--bg`. Branco sobre
  `--accent` (terracota) fica em 3,28:1 — homologado para texto grande e
  componente de interface, que é o uso (rótulo de botão).

---

## 7. Fora do escopo desta versão

- Barra lateral de navegação (o menu de áreas é a home; telas internas voltam
  pelo botão Início).
- Segunda paleta (o sistema de referência tem "cobalto"; aqui só "argila").
- Componentes de gráfico / visualização de dados.
- Tokens de densidade (compacto/confortável).
