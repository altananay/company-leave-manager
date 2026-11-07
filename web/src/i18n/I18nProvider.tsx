import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { messages, type Lang, type MessageKey } from './messages'

const STORAGE_KEY = 'leave-manager.lang'

export function detectInitialLang(stored: string | null, browserLanguage: string): Lang {
  if (stored === 'tr' || stored === 'en') {
    return stored
  }
  return browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

type I18nValue = {
  lang: Lang
  setLang: (next: Lang) => void
  t: (key: MessageKey) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    detectInitialLang(localStorage.getItem(STORAGE_KEY), navigator.language),
  )

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = messages[lang].appTitle
  }, [lang])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang: (next) => {
        localStorage.setItem(STORAGE_KEY, next)
        setLangState(next)
      },
      t: (key) => messages[lang][key],
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider')
  }
  return value
}
