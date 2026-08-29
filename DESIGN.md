# Design System - Solara OS

## 🎨 Identidade Visual

### Cores Principais
- **Primária**: Blue #1e40af (Dark), #3b82f6 (Light)
- **Secundária**: Green #10b981
- **Danger**: Red #ef4444
- **Warning**: Amber #f59e0b
- **Success**: Green #10b981

### Tipografia
- **Font Stack**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Títulos**: Segoe Bold/Semibold
- **Corpo**: Regular
- **Código**: Monospace

### Espaçamento
- xs: 4px | sm: 8px | md: 16px | lg: 24px | xl: 32px | 2xl: 48px

## 📱 Responsividade

### Breakpoints
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

### Estratégia Mobile-First
- Todas as páginas começam com layout mobile
- CSS media queries progressivas para tablets/desktop
- Touch-friendly: mínimo 44px de altura para botões

## 🎯 Componentes

### Button
```
Primary: Blue 600, white text, 12px padding
Secondary: White, blue border, blue text
Danger: Red 600, white text
States: hover (darker), active (scale 95%), disabled (opacity 70%)
```

### Input/Select
```
Border: gray-300
Focus: ring-2 ring-blue-500, border-transparent
Background: gray-50 → white on hover
Padding: 12px
```

### Card
```
Background: White
Border: 1px gray-200
Rounded: 8px-12px
Shadow: shadow-sm (hover: shadow-md)
Padding: 16-24px
```

### Header
```
Fixed sticky top
White background with subtle border
Dark text on white
Admin/Logout buttons aligned right
Logo + título na esquerda
```

### Página de Login
```
Gradiente fundo: blue-600 → blue-700
Card centralizado com 400px max
Gradiente no header: blue-600 → blue-800
Input fields com focus ring
Botão com ícone 🚀
Animação de loading
```

### Home (Menu de Áreas)
```
Grid 3 colunas (responsive)
Cards com gradiente (cada área cor diferente)
Ícones grandes (emoji)
Hover: scale 105%, shadow-xl
Estados: ativo, disabled (sem acesso), em breve
Info cards na base (3 colunas)
```

## 🎬 Animações

- **slide-in-right**: 0.3s ease-out (entradas)
- **pulse-slow**: 2s infinito (loading)
- **bounce-subtle**: 2s infinito (atenção)
- **scale-hover**: 105% (cards interativos)
- **color-transition**: 200ms (botões/links)

## ✨ Efeitos

- **Sombras**: sm (1px 2px), md (4px 6px), lg (8px 12px)
- **Blur**: backdrop blur para modais
- **Gradientes**: múltiplas direções (to-r, to-br, to-b)
- **Bordas**: rounded-lg (8px), rounded-xl (12px), rounded-2xl (16px)

## 📐 Layout Patterns

### Header + Content
```
<Header sticky top-0 z-40>
<Main flex-1 overflow-auto>
  <Container max-w-7xl>
    {content}
  </Container>
</Main>
```

### Kanban/Grid
```
Grid responsive: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Gap: gap-6
Cards: card-hover
```

### Form
```
Labels: block text-sm font-medium mb-2
Inputs: w-full input-field
Spacing: space-y-6 entre grupos
Botões: flex gap-2 (múltiplos)
```

## 🚀 Melhorias Implementadas

✅ **Login Page**
- Gradiente de fundo animado
- Card com header gradiente
- Loading spinner
- Inputs com focus ring
- Validação visual
- Mobile responsivo

✅ **Home Page**
- Cards com gradiente por área
- Grid responsivo (1/2/3 colunas)
- Hover effects subtis
- Info cards na base
- Mobile-friendly
- Ícones emoji grandes

✅ **Header Component**
- Logo com gradiente
- Reutilizável (admin, logout, back)
- Responsivo (menu colapsa em mobile)
- Sticky positioning
- Sombra sutil

✅ **Global Styles**
- CSS variables para cores
- Tailwind utilities
- Componentes reutilizáveis (.btn-primary, .card, .input-field)
- Animações suaves
- Dark mode ready

## 📱 Mobile Optimizations

- Touch targets ≥ 44px
- Padding aumentado em mobile
- Fontes maiores (16px+)
- Menos colunas em mobile (1 col por padrão)
- Menu hambúrguer em mobile
- Espaçamento amplo
- Tapas intuitivas

## 🎨 Próximas Áreas para Design

- [ ] Kanban de Vendas (cards responsivos)
- [ ] Página Admin (tabela mobile-friendly)
- [ ] Fila de Aprovações (modal/drawer)
- [ ] Organograma (versão mobile com scroll)
- [ ] Uploads de Financeiro (drag & drop melhorado)

## 🔗 Referências

- Tailwind CSS: https://tailwindcss.com
- Material Design: https://material.io
- Accessibility: https://www.a11y-101.com
