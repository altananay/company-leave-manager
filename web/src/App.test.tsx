import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
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
    // The message is announced: it sits in an Alert, not in a plain paragraph (AC-3).
    expect(screen.getByRole('alert')).toHaveTextContent('E-posta veya parola hatalı.')
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

  it('shouldShowTheLockedMessageWhenTheAccountIsLocked', async () => {
    anonymous({ '/api/auth/login': () => json(423, { status: 423, code: 'ACCOUNT_LOCKED' }) })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(
      await screen.findByText('Hesap geçici olarak kilitli. Lütfen sonra tekrar deneyin.'),
    ).toBeInTheDocument()
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

    const email = await screen.findByLabelText('E-posta')
    await user.type(email, 'taken@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'Taken Person')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByText('Bu e-posta ile bir kullanıcı zaten var.')).toBeInTheDocument()
    expect(email).toHaveFocus()
  })

  it('shouldFocusTheNameFieldWhenTheServerRejectsTheForm', async () => {
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
          return Promise.resolve(json(400, { status: 400, code: 'VALIDATION_FAILED' }))
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

    const displayName = await screen.findByLabelText('Ad soyad')
    await user.type(screen.getByLabelText('E-posta'), 'someone@acme.test')
    await user.type(displayName, 'Some Name')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByText('Lütfen alanları kontrol edin.')).toBeInTheDocument()
    expect(displayName).toHaveFocus()
  })

  it('shouldReturnFocusToTheRowAfterTheDialogCloses', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, users),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const trigger = screen.getAllByRole('button', { name: 'Pasife al' })[0]
    await user.click(trigger)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('shouldNotLoseACreatedUserWhenTheFirstListAnswerIsSlow', async () => {
    // The first list request is slow; a create + reload finishes first. The stale answer must not
    // overwrite the newer list (the created row would vanish).
    let resolveFirst!: (value: Response) => void
    const firstList = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    let listCalls = 0
    const created = { ...EMPLOYEE, id: 'u-new', email: 'new@acme.test', displayName: 'New Person' }

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
          return Promise.resolve(
            json(201, { user: created, temporaryPassword: 'temp-pass-123456' }),
          )
        }
        if (url.includes('/api/users')) {
          listCalls += 1
          return listCalls === 1 ? firstList : Promise.resolve(json(200, [created]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.type(screen.getByLabelText('E-posta'), 'new@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'New Person')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))
    await screen.findByText('New Person')

    // Now the stale first answer arrives with the old (empty) list. Flush it before asserting, so
    // the test fails if the guard is removed.
    resolveFirst(json(200, []))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('New Person')).toBeInTheDocument()
  })

  it('shouldNotDescribeTheFormFieldsWithARowError', async () => {
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
    await screen.findByText('Bu hesap ortam değişkenleriyle yönetilir; buradan değiştirilemez.')

    // A row failure is not a description of the create form's fields.
    expect(screen.getByLabelText('E-posta')).not.toHaveAttribute('aria-describedby')
  })

  it('shouldMarkAnInactiveUser', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, [{ ...EMPLOYEE, active: false }]),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    expect(await screen.findByText('Pasif')).toBeInTheDocument()
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
    // Announced as an alert, and the field it belongs to is marked invalid (AC-3).
    expect(screen.getByRole('alert')).toHaveTextContent('Bu e-posta ile bir kullanıcı zaten var.')
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true')
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
    expect(screen.getByRole('alert')).toHaveTextContent('Mevcut parola hatalı.')
    expect(screen.getByLabelText('Mevcut parola')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shouldMapTheWeakPasswordCode', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true }, () => json(200, { status: 'UP' }), {
      '/api/auth/password': () => json(400, { status: 400, code: 'WEAK_PASSWORD' }),
    })

    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText('Mevcut parola'), 'current-password-123')
    await user.type(screen.getByLabelText('Yeni parola', { exact: true }), 'brand-new-pass-123')
    await user.type(screen.getByLabelText('Yeni parola (tekrar)'), 'brand-new-pass-123')
    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }))

    expect(await screen.findByText('Parola en az 12 karakter olmalı.')).toBeInTheDocument()
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

  it('shouldFocusTheConfirmationFieldOnAMismatch', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    const user = userEvent.setup()
    renderApp()

    const confirm = await screen.findByLabelText('Yeni parola (tekrar)')
    await user.type(screen.getByLabelText('Mevcut parola'), 'current-password-123')
    await user.type(screen.getByLabelText('Yeni parola', { exact: true }), 'brand-new-pass-123')
    await user.type(confirm, 'brand-new-pass-999')
    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }))

    expect(await screen.findByText('Parolalar eşleşmiyor.')).toBeInTheDocument()
    expect(confirm).toHaveFocus()
  })

  it('shouldFocusTheCurrentPasswordFieldWhenTheServerRejectsIt', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true }, () => json(200, { status: 'UP' }), {
      '/api/auth/password': () => json(400, { status: 400, code: 'INVALID_PASSWORD' }),
    })

    const user = userEvent.setup()
    renderApp()

    const current = await screen.findByLabelText('Mevcut parola')
    await user.type(current, 'wrong-current-one')
    await user.type(screen.getByLabelText('Yeni parola', { exact: true }), 'brand-new-pass-123')
    await user.type(screen.getByLabelText('Yeni parola (tekrar)'), 'brand-new-pass-123')
    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }))

    expect(await screen.findByText('Mevcut parola hatalı.')).toBeInTheDocument()
    expect(current).toHaveFocus()
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

describe('design system', () => {
  it('shouldRenderEveryScreenWithTheDesignSystem', async () => {
    // Every screen is built from the shared primitives: a Card, the labelled Field, the Button and
    // — where the screen reports a failure — the Alert. The map claims all four, so all four are
    // asserted here instead of the card count alone.
    const screens: Array<{
      name: string
      render: () => Promise<void>
      fields: string[]
      buttons: string[]
      alerts?: number
    }> = [
      {
        name: 'login',
        render: async () => {
          anonymous()
          renderApp()
          await screen.findByRole('button', { name: 'Giriş yap' })
        },
        fields: ['E-posta', 'Parola'],
        buttons: ['Giriş yap'],
      },
      {
        name: 'password',
        render: async () => {
          authenticated({ ...EMPLOYEE, mustChangePassword: true })
          renderApp()
          await screen.findByRole('heading', { name: 'Parola değiştirme' })
        },
        fields: ['Mevcut parola', 'Yeni parola', 'Yeni parola (tekrar)'],
        buttons: ['Parolayı değiştir'],
      },
      {
        name: 'home',
        render: async () => {
          authenticated(HR)
          renderApp()
          await screen.findByText(/Giriş yapan:/)
        },
        fields: [],
        buttons: ['Kullanıcılar', 'Çıkış'],
      },
      {
        name: 'users',
        render: async () => {
          authenticated(HR, () => json(200, { status: 'UP' }), {
            '/api/users': () => json(200, [{ ...HR, active: true }]),
          })
          const user = userEvent.setup()
          renderApp()
          await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
          await screen.findByRole('heading', { name: 'Kullanıcılar' })
        },
        fields: ['Ad soyad', 'E-posta'],
        buttons: ['Oluştur'],
      },
      {
        name: 'users error',
        render: async () => {
          authenticated(HR, () => json(200, { status: 'UP' }), {
            '/api/users': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
          })
          const user = userEvent.setup()
          renderApp()
          await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
          await screen.findByRole('alert')
        },
        fields: ['Ad soyad', 'E-posta'],
        buttons: ['Oluştur'],
        alerts: 1,
      },
      {
        name: 'forbidden',
        render: async () => {
          authenticated(EMPLOYEE, () => json(200, { status: 'UP' }), {
            '/api/users': () => json(403, { status: 403, code: 'NOT_AUTHORIZED' }),
          })
          const user = userEvent.setup()
          renderApp()
          await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
          await screen.findByText('Bu sayfaya erişiminiz yok')
        },
        fields: [],
        buttons: ['Geri'],
      },
    ]

    for (const entry of screens) {
      cleanup()
      vi.unstubAllGlobals()
      await entry.render()
      expect(
        document.querySelectorAll('[data-slot="card"]').length,
        `${entry.name} uses the Card component`,
      ).toBeGreaterThan(0)
      for (const label of entry.fields) {
        expect(
          screen.getByLabelText(label),
          `${entry.name} labels its "${label}" field`,
        ).toBeInTheDocument()
      }
      for (const name of entry.buttons) {
        expect(
          screen.getByRole('button', { name }),
          `${entry.name} renders the "${name}" button`,
        ).toBeInTheDocument()
      }
      if (entry.alerts) {
        expect(screen.getAllByRole('alert'), `${entry.name} announces its failure`).toHaveLength(
          entry.alerts,
        )
      }
    }
  })

  it('shouldUseOneButtonComponentEverywhere', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () =>
        json(200, [
          { ...HR, active: true },
          { ...EMPLOYEE, active: true },
        ]),
    })

    const user = userEvent.setup()
    renderApp()
    await screen.findByText(/Giriş yapan:/)
    await user.click(screen.getByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    // Every button-shaped element comes from the design system: Button itself, or the Select
    // trigger (Radix renders it as a button). A hand-styled <button> would have no data-slot.
    const allowed = new Set(['button', 'select-trigger'])
    for (const button of buttons) {
      expect(allowed.has(button.getAttribute('data-slot') ?? ''), button.textContent ?? '').toBe(
        true,
      )
    }
  })

  it('shouldShowTheEmptyStateOnTheUsersScreen', async () => {
    // The empty state must appear after a successful empty answer, not while the list is loading.
    let resolveUsers!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveUsers = resolve
    })
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
        if (url.includes('/api/users')) {
          return pending
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    // While the request is in flight the screen says it is loading, not that there is no user.
    expect(await screen.findByText('Yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull()

    resolveUsers(json(200, []))

    expect(
      await screen.findByText('Henüz kullanıcı yok. Yukarıdaki formdan ilk kullanıcıyı oluşturun.'),
    ).toBeInTheDocument()
  })

  it('shouldNotShowTheEmptyStateWhenTheListFails', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))

    expect(
      await screen.findByText('İşlem tamamlanamadı. Lütfen tekrar deneyin.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull()
  })
})

describe('accessibility', () => {
  it('shouldHaveNoAccessibilityViolationsOnTheLoginScreen', async () => {
    anonymous()

    const { container } = renderApp()
    await screen.findByRole('button', { name: 'Giriş yap' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnTheLoginError', async () => {
    anonymous({ '/api/auth/login': () => json(401, { status: 401, code: 'NOT_AUTHENTICATED' }) })

    const user = userEvent.setup()
    const { container } = renderApp()
    await user.type(await screen.findByLabelText('E-posta'), HR.email)
    await user.type(screen.getByLabelText('Parola'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
    await screen.findByText('E-posta veya parola hatalı.')

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnThePasswordScreen', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    const { container } = renderApp()
    await screen.findByRole('heading', { name: 'Parola değiştirme' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnTheHomeScreen', async () => {
    authenticated(HR)

    const { container } = renderApp()
    await screen.findByText(/Giriş yapan:/)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnTheUsersScreen', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () =>
        json(200, [
          { ...HR, active: true },
          { ...EMPLOYEE, active: true },
        ]),
    })

    const user = userEvent.setup()
    const { container } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnTheForbiddenScreen', async () => {
    authenticated(EMPLOYEE, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(403, { status: 403, code: 'NOT_AUTHORIZED' }),
    })

    const user = userEvent.setup()
    const { container } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByText('Bu sayfaya erişiminiz yok')

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldReachEveryControlWithTheKeyboard', async () => {
    anonymous()

    const user = userEvent.setup()
    renderApp()

    const email = await screen.findByLabelText('E-posta')
    const password = screen.getByLabelText('Parola')
    const submit = screen.getByRole('button', { name: 'Giriş yap' })

    // A view change focuses the main region, so the keyboard starts at the content, not the header.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    // From there the tab order follows the visual order: e-mail, password, submit.
    await user.tab()
    expect(email).toHaveFocus()
    await user.tab()
    expect(password).toHaveFocus()
    await user.tab()
    expect(submit).toHaveFocus()
  })

  it('shouldKeepTheLanguageSwitchReachable', async () => {
    anonymous()

    const user = userEvent.setup()
    renderApp()
    await screen.findByLabelText('E-posta')

    // The header controls sit before the content region: Shift+Tab walks back to them.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'TR' })).toHaveFocus()
  })

  it('shouldReachTheUsersScreenControlsWithTheKeyboard', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () =>
        json(200, [
          { ...HR, active: true },
          { ...EMPLOYEE, active: true },
        ]),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Kullanıcılar' }))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    // The back button sits at the top of the content region, the form before the list in the
    // visual order, so the keyboard walks them in that order.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Geri' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('E-posta')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Ad soyad')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Oluştur' })).toHaveFocus()

    // And the row actions after the form, without a mouse.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Parola sıfırla' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Pasife al' })).toHaveFocus()
  })

  it('shouldReachThePasswordScreenControlsWithTheKeyboard', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Parola değiştirme' })
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    await user.tab()
    expect(screen.getByLabelText('Mevcut parola')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Yeni parola', { exact: true })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toHaveFocus()
  })
})
