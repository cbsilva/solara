'use client'

type IconType =
  | 'logo'
  | 'home'
  | 'vendas'
  | 'financeiro'
  | 'rh'
  | 'juridico'
  | 'operacoes'
  | 'novo'
  | 'editar'
  | 'deletar'
  | 'processar'
  | 'aprovado'
  | 'rejeitado'
  | 'carregando'
  | 'erro'
  | 'sucesso'
  | 'aviso'
  | 'info'
  | 'admin'
  | 'sair'
  | 'voltar'
  | 'menu'
  | 'fechar'

interface IconProps {
  type: IconType
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const sizeMap = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
  '2xl': 'w-12 h-12',
}

export function Icon({ type, size = 'md', className = '' }: IconProps) {
  const sizeClass = sizeMap[size]

  // Ícones como SVG para melhor controle e consistência
  const icons: Record<IconType, JSX.Element> = {
    logo: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 8l3 3 3-3" />
        <path d="M9 13l3 3 3-3" />
      </svg>
    ),

    home: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),

    vendas: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M9 3H5a2 2 0 0 0-2 2v4m4-6h10a2 2 0 0 1 2 2v4M9 3v18m6-18v18m6-18h4a2 2 0 0 1 2 2v4" />
        <rect x="2" y="9" width="20" height="3" />
      </svg>
    ),

    financeiro: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M12 1v22m11-13H1" />
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v12" />
      </svg>
    ),

    rh: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <circle cx="6" cy="13" r="2" />
        <circle cx="18" cy="13" r="2" />
      </svg>
    ),

    juridico: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M4 4h16v2l-2 4v8h-2v-8l-2-4h-8l-2 4v8H4v-8l-2-4V4" />
        <line x1="8" y1="21" x2="16" y2="21" />
      </svg>
    ),

    operacoes: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
        <circle cx="5" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <path d="M12 6v12M5 12h14" />
      </svg>
    ),

    novo: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M12 5v14M5 12h14" />
        <rect x="2" y="2" width="20" height="20" rx="2" />
      </svg>
    ),

    editar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),

    deletar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    ),

    processar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),

    aprovado: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),

    rejeitado: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),

    carregando: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className} animate-spin`}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
    ),

    erro: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),

    sucesso: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),

    aviso: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),

    info: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),

    admin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <circle cx="12" cy="8" r="4" />
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M9 10l2-2m4 2l-2-2" />
      </svg>
    ),

    sair: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),

    voltar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    ),

    menu: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),

    fechar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${sizeClass} ${className}`}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
  }

  return icons[type] || icons.info
}
