import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'leave-manager.theme'

/** An unknown or missing stored value falls back to the system preference (spec 0007 AC-2). */
export function detectInitialTheme(stored: string | null): Theme {
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

type ThemeValue = {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (next: Theme) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

/**
 * The shadcn/ui Vite pattern (spec 0007 D-1): `light | dark | system`, persisted in localStorage,
 * applied as a `.dark` class on <html>. The `index.html` inline script sets the class before the
 * first paint; this provider keeps it in sync and follows the OS while `system` is selected.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    detectInitialTheme(localStorage.getItem(THEME_STORAGE_KEY)),
  )
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      resolved,
      setTheme: (next) => {
        localStorage.setItem(THEME_STORAGE_KEY, next)
        setThemeState(next)
      },
    }),
    [theme, resolved],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return value
}
