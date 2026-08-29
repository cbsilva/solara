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

4. **Crie as tabelas no Supabase**
   
   - Abra o [Painel Supabase](https://supabase.com/dashboard)
   - Vá em **SQL Editor** → **New query**
   - Copie e execute o conteúdo de `sql/criar_tabelas.sql`
   - Isso criará as tabelas `execucoes_agentes` e `aprovacoes` com Realtime habilitado
   - Veja `sql/README.md` para mais detalhes

5. **Crie um usuário admin**
   
   - No painel Supabase: **Authentication** → **Users** → **Add user**
   - Email e senha de sua escolha
   - Na aba **SQL**, execute:
   ```sql
   INSERT INTO perfis (id, email, nome, papel, areas)
   SELECT id, email, email as nome, 'admin', ARRAY['vendas', 'financeiro']
   FROM auth.users
   WHERE email = 'seu-email@exemplo.com';
   ```

6. **Inicie o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```
   
   Acesse http://localhost:3000 e faça login com suas credenciais

## 📋 Estrutura do Projeto

```
solara-os/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Layout raiz
│   ├── page.tsx           # Menu de áreas (protegido)
│   ├── login/
│   │   └── page.tsx       # Página de login
│   ├── admin/
│   │   └── page.tsx       # Administração de usuários (só admin)
│   └── api/
│       └── admin/
│           └── criar-usuario/route.ts  # API para criar usuário
├── lib/
│   ├── supabase/
│   │   ├── client.ts      # Cliente Supabase (browser)
│   │   └── server.ts      # Cliente Supabase (servidor)
│   ├── hooks/
│   │   └── useAuth.ts     # Hook de autenticação
│   ├── agente.ts          # Função central dos agentes ✓
│   └── orquestradores/    # Orquestração de agentes (próximos passos)
├── components/
│   ├── Organograma.tsx         # Visualização de execuções em tempo real ✓
│   ├── FilaAprovacao.tsx       # Fila de aprovações ✓
│   └── LinhaDoTempo.tsx        # Timeline de execuções ✓
├── prompts/               # Prompts dos agentes em Markdown
│   ├── vendas/            # Prompts da área de Vendas
│   └── financeiro/        # Prompts da área de Financeiro
├── sql/                   # Scripts SQL
│   ├── criar_tabelas.sql  # Criar tabelas execucoes_agentes e aprovacoes
│   └── README.md          # Instruções
├── dados/                 # Arquivos CSV para importação
├── .env.example           # Template de variáveis de ambiente
└── package.json           # Dependências e scripts
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

## ✅ Implementado

### Fundação (Seção 1)
- ✓ Projeto Next.js 15 com App Router
- ✓ Supabase Auth (email/senha)
- ✓ Página de login `/login`
- ✓ Página inicial protegida `/`

### Casca (Seção 2)
- ✓ Menu de áreas com cartões (Vendas, Financeiro ativos; RH, Jurídico, Operações em breve)
- ✓ Página `/admin` para criar usuários (só admin)
- ✓ Rota de API para criar usuário com service role
- ✓ Tabela `perfis` com papel e áreas

### Motor (Seção 3)
- ✓ Função `agente()` em `lib/agente.ts` que:
  - Cria execução com status `rodando`
  - Lê prompt de `prompts/<area>/<papel>.md`
  - Chama API Anthropic
  - Faz parse JSON
  - Atualiza status para `ok` ou `erro`
  - Registra tokens e tempo
- ✓ Tabelas SQL:
  - `execucoes_agentes` com Realtime
  - `aprovacoes` com Realtime
- ✓ Componente `Organograma` com:
  - Realtime de execuções
  - Estados visuais (cinza, pulsando, ok, erro)
  - Mostra tempo e tokens
  - Seta vermelha quando revisor reprovar
- ✓ Componente `FilaAprovacao` com:
  - Lista de itens pendentes
  - Edição de proposta
  - Botões: Aprovar, Salvar e Aprovar, Rejeitar
  - Realtime
- ✓ Componente `LinhaDoTempo` com:
  - Lista de execuções por item
  - Estados visuais
  - Expandir para ver entrada/saída/erro

## 📚 Próximos Passos

- **Seção 4 - Vendas**: Página `/vendas`, kanban de pedidos, orquestrador com triador, pesquisador, redator, revisor
- **Seção 5 - Financeiro**: Página `/financeiro`, upload de extrato, orquestrador com investigador, consolidador, revisor

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
