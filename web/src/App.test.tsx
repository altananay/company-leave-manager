import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { I18nProvider, detectInitialLang } from './i18n/I18nProvider'

const STORAGE_KEY = 'leave-manager.lang'

const HR = {
  id: 'u-hr',
  email: 'hr@acme.test',
  displayName: 'HR Admin',
  role: 'HR',
  mustChangePassword: false,
}

const EMPLOYEE = {
  id: 'u-emp',
  email: 'emp@acme.test',
  displayName: 'Employee',
  role: 'EMPLOYEE',
  mustChangePassword: false,
}

type Route = () => Response | Promise<Response>

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

/** Routes fetch by URL substring; an unknown URL answers 404. */
function stubApi(routes: Record<string, Route>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const key = Object.keys(routes).find((candidate) => url.includes(candidate))
      return Promise.resolve(key ? routes[key]() : json(404, null))
    }),
  )
}

function anonymous(routes: Record<string, Route> = {}) {
  stubApi({
    '/api/auth/me': () => json(401, null),
    '/api/auth/csrf': () => json(200, { token: 't' }),
    ...routes,
  })
}

function authenticated(
  me: typeof HR,
  health: Route = () => json(200, { status: 'UP' }),
  extra: Record<string, Route> = {},
) {
  stubApi({ '/api/auth/me': () => json(200, me), '/api/health': health, ...extra })
}

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}

function setBrowserLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  setBrowserLanguage('tr-TR')
  document.documentElement.lang = 'tr'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authentication', () => {
  it('shouldShowLoginWhenAnonymous', async () => {
    anonymous()

    renderApp()

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-posta')).toBeInTheDocument()
  })

  it('shouldShowHomeAfterLogin', async () => {
    anonymous({
      '/api/auth/login': () => json(200, HR),
      '/api/health': () => json(200, { status: 'UP' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'hr-password-123456')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByText(/Giriş yapan:/)).toBeInTheDocument()
    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
  })

  it('shouldShowForbiddenForNonHrUsers', async () => {
    authenticated(EMPLOYEE, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(403, { status: 403, code: 'NOT_AUTHORIZED' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    expect(await screen.findByText('Bu sayfaya erişiminiz yok')).toBeInTheDocument()
  })
})

describe('health status', () => {
  it('shouldShowLoadingThenSuccess', async () => {
    let resolveHealth!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveHealth = resolve
    })
    authenticated(HR, () => pending)

    renderApp()

    expect(await screen.findByText('Kontrol ediliyor…')).toBeInTheDocument()

    resolveHealth(json(200, { status: 'UP' }))

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
  })

  it('shouldShowErrorAndRetry', async () => {
    const health = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(json(200, { status: 'UP' }))
    authenticated(HR, health)

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }))

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
    expect(health).toHaveBeenCalledTimes(2)
  })

  it('shouldShowErrorOn503Down', async () => {
    const health = vi
      .fn()
      .mockResolvedValueOnce(json(503, { status: 'DOWN' }))
      .mockResolvedValueOnce(json(200, { status: 'UP' }))
    authenticated(HR, health)

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }))

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
  })
})

describe('detectInitialLang', () => {
  it('shouldPreferTheStoredLanguageOverTheBrowser', () => {
    expect(detectInitialLang('en', 'tr-TR')).toBe('en')
    expect(detectInitialLang('tr', 'en-US')).toBe('tr')
  })

  it('shouldUseTheBrowserLanguageWhenNothingIsStored', () => {
    expect(detectInitialLang(null, 'en-GB')).toBe('en')
    expect(detectInitialLang(null, 'tr-TR')).toBe('tr')
  })

  it('shouldFallBackToTurkishForAnyOtherLanguage', () => {
    expect(detectInitialLang(null, 'de-DE')).toBe('tr')
    expect(detectInitialLang(null, '')).toBe('tr')
  })
})

describe('language', () => {
  it('shouldUseBrowserLanguageAsDefault', async () => {
    setBrowserLanguage('en-US')
    anonymous()

    renderApp()

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(document.title).toBe('Leave Management')
  })

  it('shouldFallBackToTurkishForOtherBrowserLanguages', async () => {
    setBrowserLanguage('de-DE')
    anonymous()

    renderApp()

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument()
  })

  it('shouldUseTheStoredLanguageOnReload', async () => {
    localStorage.setItem(STORAGE_KEY, 'en')
    anonymous()

    renderApp()

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shouldSwitchLanguageAndPersist', async () => {
    anonymous()

    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('button', { name: 'Giriş yap' })
    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Leave Management')
  })
})
