# Solara OS

Sistema inteligente de gestão para Solara Distribuidora, com agentes de IA que automatizam processos de vendas e financeiro.

## 🎯 Visão Geral

Solara OS é uma aplicação web que usa agentes de IA para:
- **Vendas**: processar pedidos de orçamento, consultar estoque/preço, gerar propostas e controlar aprovações
- **Financeiro**: reconciliar extratos bancários, investigar divergências e gerar relatórios

A máquina prepara, a pessoa decide. Nenhuma ação sai do sistema sem aprovação humana.

## 🛠️ Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- **Backend**: Next.js API Routes
- **Banco de dados**: PostgreSQL via Supabase
- **Autenticação**: Supabase Auth (email/senha)
- **Realtime**: Supabase Realtime
- **IA**: API Anthropic (Claude Sonnet 4.6)
- **Deploy**: Vercel

## 🚀 Começando

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta Supabase (gratuita em https://supabase.com)
- Chave API Anthropic (em https://console.anthropic.com)

### Setup Local

1. **Clone o repositório**
   ```bash
   git clone https://github.com/seu-usuario/solara-os.git
   cd solara-os
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   
   Crie um arquivo `.env.local` baseado em `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   
   Preencha com suas credenciais:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do seu projeto Supabase
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Chave pública do Supabase
   - `SUPABASE_SECRET_KEY`: Chave privada do Supabase (apenas servidor)
   - `ANTHROPIC_API_KEY`: Chave API Anthropic

4. **Inicie o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```
   
   Acesse http://localhost:3000

## 📋 Estrutura do Projeto

```
solara-os/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Layout raiz
│   ├── page.tsx           # Página inicial (protegida)
│   └── login/
│       └── page.tsx       # Página de login
├── lib/
│   ├── supabase/
│   │   ├── client.ts      # Cliente Supabase (browser)
│   │   └── server.ts      # Cliente Supabase (servidor)
│   ├── hooks/
│   │   └── useAuth.ts     # Hook de autenticação
│   ├── agente.ts          # Função central dos agentes (próximos passos)
│   └── orquestradores/    # Orquestração de agentes (próximos passos)
├── components/            # Componentes React reutilizáveis
├── prompts/              # Prompts dos agentes em Markdown
├── dados/                # Arquivos CSV para importação
├── .env.example          # Template de variáveis de ambiente
└── package.json          # Dependências e scripts

```

## 🔐 Autenticação

A aplicação usa Supabase Auth com email e senha:

1. **Criar usuário admin** (primeira vez):
   - Acesse o [painel Supabase](https://supabase.com/dashboard)
   - Vá em "Authentication" → "Users"
   - Clique "Add user"
   - Defina email, senha e clique "Create user"

2. **Fazer login**:
   - Acesse http://localhost:3000/login
   - Use as credenciais criadas
   - Será redirecionado para a página inicial

## 📦 Dependências Principais

- `next@15.5.24` - Framework React/Node.js
- `@supabase/supabase-js@2.38.0` - Cliente Supabase
- `@supabase/ssr@0.12.5` - SSR utilities para Supabase
- `@anthropic-ai/sdk@0.24.0` - SDK Anthropic
- `react@19.0.0` - Biblioteca UI
- `typescript@5.3.0` - Tipagem

## 📝 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia servidor de desenvolvimento

# Produção
npm run build        # Constrói aplicação para produção
npm start            # Inicia servidor de produção
npm run lint         # Executa linting

```

## 🔄 Fluxo de Autenticação

1. Usuário acessa `/`
2. Se não autenticado → redireciona para `/login`
3. Em `/login`, faz login com email/senha
4. Se sucesso → redireciona para `/`
5. Em `/`, exibe "Solara OS" e email do usuário

## 📚 Próximos Passos

A arquitetura está pronta para as próximas seções:

- **Seção 2 - Casca**: Menu de áreas, administração de usuários, tabela `perfis`
- **Seção 3 - Motor**: Função `agente()`, registro de execuções, organograma, fila de aprovação
- **Seção 4 - Vendas**: Processamento de pedidos com triador, pesquisador, redator, revisor
- **Seção 5 - Financeiro**: Conciliação bancária com investigador, consolidador, revisor

## 🚀 Deploy na Vercel

1. Push o repositório para GitHub
2. Conecte a conta GitHub à Vercel (https://vercel.com)
3. Crie novo projeto e selecione este repositório
4. Configure as variáveis de ambiente no painel Vercel
5. Deploy automático em cada push

## 📖 Documentação

- [PRD.md](./PRD.md) - Descrição do problema e solução para o negócio
- [SPEC.md](./SPEC.md) - Especificação técnica detalhada
- [CLAUDE.md](./CLAUDE.md) - Regras e convenções do projeto

## 🤝 Contribuindo

Este é um projeto de aula. Siga as regras em CLAUDE.md:
- Tudo em português (sem acentos em identificadores)
- Código limpo e bem tipado
- Sem commits automáticos (feitos manualmente na aula)

## 📄 Licença

Propriedade da Solara Distribuidora.

---

**Status**: Fundação implementada ✓ | Próximo: Seção Casca
