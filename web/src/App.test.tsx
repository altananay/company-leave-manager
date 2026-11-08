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
  stubApi({
    '/api/auth/me': () => json(200, me),
    '/api/auth/csrf': () => json(200, { token: 't' }),
    '/api/health': health,
    ...extra,
  })
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
  sessionStorage.clear()
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
    // A first visit is not an ended session.
    expect(screen.queryByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeNull()
  })

  it('shouldShowOnlyTheGenericErrorOnAWrongPassword', async () => {
    anonymous({ '/api/auth/login': () => json(401, { status: 401, code: 'NOT_AUTHENTICATED' }) })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByText('E-posta veya parola hatalı.')).toBeInTheDocument()
    expect(screen.queryByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeNull()
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

  it('shouldReturnToLoginWithAMessageWhenTheSessionEndsMidway', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(401, { status: 401, code: 'SESSION_EXPIRED' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument()
    expect(screen.getByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeInTheDocument()
  })

  it('shouldKeepTheSessionMessageAcrossAReload', async () => {
    // The tab had a session before the reload; the marker outlives the page.
    sessionStorage.setItem('leave-manager.had-session', '1')
    anonymous()

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument()
    expect(screen.getByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeInTheDocument()
  })

  it('shouldKeepTheSessionMessageAfterAFurtherReload', async () => {
    // The notice was already shown once ('expired'): reloading must not lose it.
    sessionStorage.setItem('leave-manager.had-session', 'expired')
    anonymous()

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument()
    expect(screen.getByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeInTheDocument()
  })

  it('shouldNotClaimASessionEndedWhenTheProbeFailsForAnotherReason', async () => {
    // A stale marker from an earlier login, then the probe fails with a 500 (not a 401).
    sessionStorage.setItem('leave-manager.had-session', '1')
    stubApi({
      '/api/auth/me': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
      '/api/auth/csrf': () => json(200, { token: 't' }),
      '/api/auth/login': () => json(401, { status: 401, code: 'NOT_AUTHENTICATED' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByText('E-posta veya parola hatalı.')).toBeInTheDocument()
    expect(screen.queryByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeNull()
  })

  it('shouldReplaceTheSessionMessageWithTheLoginError', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(401, { status: 401, code: 'SESSION_EXPIRED' }),
    })
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    expect(
      await screen.findByText('Oturum sona erdi. Lütfen yeniden giriş yapın.'),
    ).toBeInTheDocument()

    // A new attempt on the login screen shows its own result, not both messages.
    const login = vi.fn(() =>
      Promise.resolve(json(401, { status: 401, code: 'NOT_AUTHENTICATED' })),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/csrf')) {
          return Promise.resolve(json(200, { token: 't' }))
        }
        if (url.includes('/api/auth/login')) {
          return login()
        }
        return Promise.resolve(json(401, null))
      }),
    )

    await user.type(screen.getByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByText('E-posta veya parola hatalı.')).toBeInTheDocument()
    expect(screen.queryByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeNull()
    // The message came from the login answer, not from a failed CSRF bootstrap.
    expect(login).toHaveBeenCalledTimes(1)
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

  it('shouldLogOutWithoutANotice', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/auth/logout': () => json(204, null),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Çıkış' }))

    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument()
    expect(screen.queryByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeNull()
  })

  it('shouldExplainWhenTheSessionWasAlreadyGoneAtLogout', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/auth/logout': () => json(401, { status: 401, code: 'NOT_AUTHENTICATED' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Çıkış' }))

    // The 401 handler explained the lost session; the logout must not wipe that explanation.
    expect(await screen.findByRole('heading', { name: 'Giriş' })).toBeInTheDocument()
    expect(screen.getByText('Oturum sona erdi. Lütfen yeniden giriş yapın.')).toBeInTheDocument()
  })
})

describe('users screen', () => {
  const CEO_ROW = {
    id: 'u-ceo',
    email: 'ceo@acme.test',
    displayName: 'CEO',
    role: 'CEO',
    mustChangePassword: false,
    active: true,
  }
  const users = [
    CEO_ROW,
    { ...HR, active: true },
    { ...EMPLOYEE, active: true },
    { ...EMPLOYEE, id: 'u-emp-2', email: 'emp2@acme.test', displayName: 'Second', active: true },
  ]

  it('shouldNotOfferActionsOnASeededAccount', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, users),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    // The server refuses these rows (PROTECTED_ACCOUNT); the screen must not offer any action:
    // two seeded rows (CEO + HR) show the note, the two employees keep their buttons.
    expect(screen.getAllByText('Ortam değişkenleriyle yönetilir')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Pasife al' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Parola sıfırla' })).toHaveLength(2)
  })

  it('shouldShowTheServerCodeAsItsOwnMessage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/csrf')) {
          return Promise.resolve(json(200, { token: 't' }))
        }
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(json(200, HR))
        }
        if (url.includes('/api/health')) {
          return Promise.resolve(json(200, { status: 'UP' }))
        }
        if (url.includes('/reset-password')) {
          return Promise.resolve(json(403, { status: 403, code: 'PROTECTED_ACCOUNT' }))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, users))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.click(screen.getAllByRole('button', { name: 'Parola sıfırla' })[0])

    expect(
      await screen.findByText('Bu hesap ortam değişkenleriyle yönetilir; buradan değiştirilemez.'),
    ).toBeInTheDocument()
  })

  it('shouldFocusTheEmailFieldWhenTheAddressIsTaken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/csrf')) {
          return Promise.resolve(json(200, { token: 't' }))
        }
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(json(200, HR))
        }
        if (url.includes('/api/health')) {
          return Promise.resolve(json(200, { status: 'UP' }))
        }
        if (url.includes('/api/users') && String(input).includes('/api/users')) {
          return Promise.resolve(json(409, { status: 409, code: 'EMAIL_EXISTS' }))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    const email = await screen.findByLabelText('E-posta')
    await user.type(email, 'taken@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'Taken Person')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByText('Bu e-posta ile bir kullanıcı zaten var.')).toBeInTheDocument()
    expect(email).toHaveFocus()
  })

  it('shouldAskForConfirmationBeforeDeactivating', async () => {
    const deactivate = vi.fn(() => json(204, null))
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/csrf')) {
          return Promise.resolve(json(200, { token: 't' }))
        }
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(json(200, HR))
        }
        if (url.includes('/api/health')) {
          return Promise.resolve(json(200, { status: 'UP' }))
        }
        if (url.includes('/deactivate')) {
          return Promise.resolve(deactivate())
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, users))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const buttons = await screen.findAllByRole('button', { name: 'Pasife al' })
    await user.click(buttons[1])

    // The first click only asks; nothing is sent yet.
    expect(deactivate).not.toHaveBeenCalled()
    expect(screen.getByText('Bu kullanıcı pasife alınsın mı?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Onayla' }))

    expect(deactivate).toHaveBeenCalledTimes(1)
  })

  it('shouldReportAnExistingEmailWithItsOwnMessage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/auth/csrf')) {
          return Promise.resolve(json(200, { token: 't' }))
        }
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(json(200, HR))
        }
        if (url.includes('/api/health')) {
          return Promise.resolve(json(200, { status: 'UP' }))
        }
        if (url.includes('/api/users') && init?.method === 'POST') {
          return Promise.resolve(json(409, { status: 409, code: 'EMAIL_EXISTS' }))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, users))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    await user.type(await screen.findByLabelText('E-posta'), 'taken@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'Taken Person')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByText('Bu e-posta ile bir kullanıcı zaten var.')).toBeInTheDocument()
  })
})

describe('password change', () => {
  it('shouldReportAWrongCurrentPassword', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true }, () => json(200, { status: 'UP' }), {
      '/api/auth/password': () => json(400, { status: 400, code: 'INVALID_PASSWORD' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('Mevcut parola'), 'wrong-current-one')
    await user.type(screen.getByLabelText('Yeni parola', { exact: true }), 'brand-new-pass-123')
    await user.type(screen.getByLabelText('Yeni parola (tekrar)'), 'brand-new-pass-123')
    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }))

    expect(await screen.findByText('Mevcut parola hatalı.')).toBeInTheDocument()
  })

  it('shouldFocusTheFieldToCorrect', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    const user = userEvent.setup()
    renderApp()

    const next = await screen.findByLabelText('Yeni parola', { exact: true })
    await user.type(screen.getByLabelText('Mevcut parola'), 'current-password-123')
    await user.type(next, 'short')
    await user.type(screen.getByLabelText('Yeni parola (tekrar)'), 'short')
    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }))

    expect(await screen.findByText('Parola en az 12 karakter olmalı.')).toBeInTheDocument()
    expect(next).toHaveFocus()
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

  it('shouldTranslateTheErrorStateToo', async () => {
    authenticated(HR, () => json(503, { status: 'DOWN' }))

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByText('Connection error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shouldTranslateTheSuccessStateToo', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }))

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByText('System is up')).toBeInTheDocument()
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

  it('shouldTranslateThePasswordScreen', async () => {
    setBrowserLanguage('en-US')
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()
  })

  it('shouldTranslateTheUsersScreen', async () => {
    setBrowserLanguage('en-US')
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, [{ ...HR, active: true }]),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Users' }))

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('shouldTranslateTheForbiddenScreen', async () => {
    setBrowserLanguage('en-US')
    authenticated(EMPLOYEE, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(403, { status: 403, code: 'NOT_AUTHORIZED' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Users' }))

    expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument()
  })
})
