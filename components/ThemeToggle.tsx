'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'

type Tema = 'light' | 'dark'

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null)

  useEffect(() => {
    const salvo = (localStorage.getItem('tema') as Tema | null) ?? null
    if (salvo) {
      setTema(salvo)
      document.documentElement.setAttribute('data-theme', salvo)
    } else {
      const prefereDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTema(prefereDark ? 'dark' : 'light')
    }
  }, [])

  const alternar = () => {
    const proximo: Tema = tema === 'dark' ? 'light' : 'dark'
    setTema(proximo)
    document.documentElement.setAttribute('data-theme', proximo)
    localStorage.setItem('tema', proximo)
  }

  return (
    <button
      type="button"
      className="tema-btn"
      onClick={alternar}
      aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    >
      <Icon type={tema === 'dark' ? 'sol' : 'lua'} size="md" />
    </button>
  )
}
