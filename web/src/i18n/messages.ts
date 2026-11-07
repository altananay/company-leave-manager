export type Lang = 'tr' | 'en'

export const messages = {
  tr: {
    appTitle: 'İzin Yönetimi',
    languageLabel: 'Dil',
    loading: 'Kontrol ediliyor…',
    up: 'Sistem çalışıyor',
    down: 'Bağlantı hatası',
    retry: 'Yeniden dene',
  },
  en: {
    appTitle: 'Leave Management',
    languageLabel: 'Language',
    loading: 'Checking…',
    up: 'System is up',
    down: 'Connection error',
    retry: 'Try again',
  },
} as const

export type MessageKey = keyof typeof messages.tr
