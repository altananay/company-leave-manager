import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ThemeProvider } from './app/ThemeProvider'
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
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>,
  )
}

/**
 * A navigation item of the signed-in shell, scoped to the sidebar landmark so a page action with
 * the same label could never be picked up by mistake.
 */
async function navigationButton(name: string) {
  return within(await screen.findByRole('complementary')).getByRole('button', { name })
}

function setBrowserLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // The screen follows the URL (spec 0004, AC-9): a test that navigated must not leave the next
  // one on that route, so every test starts at the shell's home path.
  window.history.replaceState({}, '', '/')
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

    await user.click(await navigationButton('Kullanıcılar'))

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

    await user.click(await navigationButton('Kullanıcılar'))
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

    await user.click(await navigationButton('Kullanıcılar'))

    expect(
      await screen.findByRole('heading', { name: 'Bu sayfaya erişiminiz yok' }),
    ).toBeInTheDocument()
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

  /** Opens the users screen with a fixed list; the caller waits for the table when it exists. */
  async function openUsersWith(rows: unknown[]) {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, rows),
    })
    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    return user
  }

  it('shouldNotOfferActionsOnASeededAccount', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(200, users),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    // The server refuses these rows (PROTECTED_ACCOUNT); the screen must not offer any action:
    // two seeded rows (CEO + HR) show the note, the two employees keep one menu each.
    expect(screen.getAllByText('Ortam değişkenleriyle yönetilir')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'İşlemler' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Pasife al' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Parola sıfırla' })).toBeNull()

    // The actions exist, behind the menu (AC-14).
    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    expect(await screen.findByRole('menuitem', { name: 'Parola sıfırla' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pasife al' })).toBeInTheDocument()
  })

  it('shouldFilterTheListBySearch', async () => {
    const user = await openUsersWith(users)
    const search = screen.getByLabelText('İsim veya e-posta ara')
    const table = await screen.findByRole('table')

    // By name: only "Second" survives.
    await user.type(search, 'Second')
    expect(within(table).getByText('Second')).toBeInTheDocument()
    expect(within(table).queryByText('HR Admin')).toBeNull()

    // By e-mail too, and the row is the same one.
    await user.clear(search)
    await user.type(search, 'emp2@acme.test')
    expect(within(screen.getByRole('table')).getByText('Second')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('emp2@acme.test')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('HR Admin')).toBeNull()
  })

  it('shouldFilterTheListByRole', async () => {
    const user = await openUsersWith(users)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'İK' }))
    const hrTable = screen.getByRole('table')
    expect(within(hrTable).getByText('HR Admin')).toBeInTheDocument()
    expect(within(hrTable).queryByText('Second')).toBeNull()
    expect(within(hrTable).queryByText('CEO')).toBeNull()

    // The employee filter keeps both employees and drops the seeded accounts.
    await user.click(screen.getByRole('button', { name: 'Çalışan' }))
    const employeeTable = screen.getByRole('table')
    expect(within(employeeTable).getAllByText('Çalışan')).toHaveLength(2)
    expect(within(employeeTable).queryByText('HR Admin')).toBeNull()
  })

  it('shouldPaginateTheList', async () => {
    const paged = Array.from({ length: 11 }, (_, index) => ({
      id: `u-pager-${index}`,
      email: `pager${index}@acme.test`,
      displayName: `Pager ${index}`,
      role: index === 0 ? 'HR' : 'EMPLOYEE',
      mustChangePassword: false,
      active: true,
    }))
    const user = await openUsersWith(paged)
    await screen.findByRole('table')

    // Ten rows on the first page, the eleventh only after "Sonraki".
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(screen.queryByText('Pager 10')).toBeNull()
    expect(screen.getByText(/1–10 \/ 11/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sonraki' }))

    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.getByText('Pager 10')).toBeInTheDocument()
    expect(screen.getByText(/11–11 \/ 11/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sonraki' })).toBeDisabled()
  })

  it('shouldShowASkeletonWhileTheListLoads', async () => {
    let resolveUsers!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveUsers = resolve
    })
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () => pending,
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))

    // The loading state is a skeleton, not a claim that the list is empty or a stale table.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="users-skeleton"]')).toBeInTheDocument(),
    )
    // The skeleton is decorative (`aria-hidden`): the state is announced by its own status text.
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull()

    resolveUsers(json(200, users))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="users-skeleton"]')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shouldShowTheEmptyStateAfterAFilter', async () => {
    const user = await openUsersWith(users)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('İsim veya e-posta ara'), 'no-such-user')

    expect(screen.getByText('Bu filtreye uyan kullanıcı yok.')).toBeInTheDocument()
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull()

    // A genuinely empty list is a different state and keeps the first-run message.
    cleanup()
    vi.unstubAllGlobals()
    await openUsersWith([])
    expect(
      await screen.findByText('Henüz kullanıcı yok. Yukarıdaki formdan ilk kullanıcıyı oluşturun.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Bu filtreye uyan kullanıcı yok.')).toBeNull()
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Parola sıfırla' }))

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
    await user.click(await navigationButton('Kullanıcılar'))

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
    await user.click(await navigationButton('Kullanıcılar'))

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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const trigger = screen.getAllByRole('button', { name: 'İşlemler' })[0]
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Pasife al' }))
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
    await user.click(await navigationButton('Kullanıcılar'))
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Parola sıfırla' }))
    await screen.findByText('Bu hesap ortam değişkenleriyle yönetilir; buradan değiştirilemez.')

    // A row failure is not a description of the create form's fields.
    expect(screen.getByLabelText('E-posta')).not.toHaveAttribute('aria-describedby')
  })

  it('shouldEditTheManagerAndHireDateOfAnExistingUser', async () => {
    // L-04: the row action opens the edit dialog and PATCHes the two org fields.
    const manager = {
      id: 'u-lead',
      email: 'lead@acme.test',
      displayName: 'Lead Person',
      role: 'MANAGER',
      mustChangePassword: false,
      active: true,
      managerId: null,
      hireDate: '2020-01-01',
    }
    const target = {
      id: 'u-edit',
      email: 'edit@acme.test',
      displayName: 'Edit Person',
      role: 'EMPLOYEE',
      mustChangePassword: false,
      active: true,
      managerId: null,
      hireDate: null,
    }
    let patched: unknown = null
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
        if (url.includes('/api/users') && init?.method === 'PATCH') {
          patched = JSON.parse(String(init.body))
          return Promise.resolve(
            json(200, { ...target, managerId: manager.id, hireDate: '2021-04-05' }),
          )
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, [target, manager]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await screen.findByRole('table')

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Yönetici' }))
    await user.click(await screen.findByRole('option', { name: 'Lead Person' }))
    fireEvent.change(within(dialog).getByLabelText('İşe giriş tarihi'), {
      target: { value: '2021-04-05' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    await waitFor(() =>
      expect(patched).toEqual({
        managerId: 'u-lead',
        hireDate: '2021-04-05',
        birthDate: null,
        hasSchoolAgeChild: false,
      }),
    )
    expect(await screen.findByText('Kullanıcı güncellendi.')).toBeInTheDocument()
  })

  it('shouldCreateAUserWithTheBirthDateAndTheSchoolAgeFlag', async () => {
    // D17/D18: the create form carries the two HR-only personal fields in its body.
    const created = {
      ...EMPLOYEE,
      id: 'u-new',
      email: 'new@acme.test',
      displayName: 'New Person',
      active: true,
      managerId: null,
      hireDate: null,
      birthDate: '1990-05-17',
      hasSchoolAgeChild: true,
    }
    let posted: unknown = null
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
          posted = JSON.parse(String(init.body))
          return Promise.resolve(
            json(201, { user: created, temporaryPassword: 'temp-pass-123456' }),
          )
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, [created]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.type(await screen.findByLabelText('E-posta'), 'new@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'New Person')
    fireEvent.change(screen.getByLabelText('Doğum tarihi'), {
      target: { value: '1990-05-17' },
    })
    await user.click(screen.getByRole('checkbox', { name: 'Okul çağında çocuğu var' }))
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted).toEqual({
      email: 'new@acme.test',
      displayName: 'New Person',
      role: 'EMPLOYEE',
      managerId: null,
      hireDate: null,
      birthDate: '1990-05-17',
      hasSchoolAgeChild: true,
    })
  })

  it('shouldMarkTheCreateBirthDateFieldWhenTheServerRejectsIt', async () => {
    // T-2: the create path carries the same field-level INVALID_BIRTH_DATE as the edit dialog — the
    // refusal marks (and focuses) the birth date, not the hire date or the name beside it.
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
          return Promise.resolve(json(400, { status: 400, code: 'INVALID_BIRTH_DATE' }))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, [EMPLOYEE]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    await user.type(await screen.findByLabelText('E-posta'), 'bad-birth@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'Bad Birth')
    fireEvent.change(screen.getByLabelText('Doğum tarihi'), {
      target: { value: '1899-12-31' },
    })
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(
      await screen.findByText('Doğum tarihi 1900 ile bugün arasında olmalı.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Doğum tarihi')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('İşe giriş tarihi')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Doğum tarihi')).toHaveFocus()
  })

  it('shouldEditTheBirthDateAndTheSchoolAgeFlag', async () => {
    // The edit dialog prefills both fields from the response and sends them back; the refreshed row
    // proves the two fields round-trip through the server's answer.
    const target = {
      id: 'u-edit',
      email: 'edit@acme.test',
      displayName: 'Edit Person',
      role: 'EMPLOYEE',
      mustChangePassword: false,
      active: true,
      managerId: null,
      hireDate: null,
      birthDate: '1990-05-17',
      hasSchoolAgeChild: true,
    }
    let rows = [target]
    let patched: unknown = null
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
        if (url.includes('/api/users') && init?.method === 'PATCH') {
          patched = JSON.parse(String(init.body))
          rows = [{ ...target, birthDate: '1991-06-18', hasSchoolAgeChild: false }]
          return Promise.resolve(json(200, rows[0]))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, rows))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await screen.findByRole('table')

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Doğum tarihi')).toHaveValue('1990-05-17')
    const checkbox = within(dialog).getByRole('checkbox', { name: 'Okul çağında çocuğu var' })
    expect(checkbox).toBeChecked()

    fireEvent.change(within(dialog).getByLabelText('Doğum tarihi'), {
      target: { value: '1991-06-18' },
    })
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    await waitFor(() =>
      expect(patched).toEqual({
        managerId: null,
        hireDate: null,
        birthDate: '1991-06-18',
        hasSchoolAgeChild: false,
      }),
    )
    expect(await screen.findByText('Kullanıcı güncellendi.')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Düzenle' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByLabelText('Doğum tarihi')).toHaveValue('1991-06-18')
    expect(
      within(reopened).getByRole('checkbox', { name: 'Okul çağında çocuğu var' }),
    ).not.toBeChecked()
  })

  it('shouldMarkTheBirthDateFieldWhenTheServerRejectsIt', async () => {
    // INVALID_BIRTH_DATE belongs to the birth date, not to the hire date beside it (M-13).
    const target = {
      id: 'u-edit',
      email: 'edit@acme.test',
      displayName: 'Edit Person',
      role: 'EMPLOYEE',
      mustChangePassword: false,
      active: true,
      managerId: null,
      hireDate: null,
      birthDate: '1990-05-17',
      hasSchoolAgeChild: false,
    }
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
        if (url.includes('/api/users') && init?.method === 'PATCH') {
          return Promise.resolve(json(400, { status: 400, code: 'INVALID_BIRTH_DATE' }))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, [target]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await screen.findByRole('table')

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Doğum tarihi'), {
      target: { value: '1899-12-31' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    expect(
      await within(dialog).findByText('Doğum tarihi 1900 ile bugün arasında olmalı.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Doğum tarihi')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('İşe giriş tarihi')).not.toHaveAttribute('aria-invalid')
  })

  it('shouldMarkOnlyTheFieldTheEditRefusalIsAbout', async () => {
    // M-13: an INVALID_MANAGER refusal belongs to the manager select. Marking the hire date as
    // invalid too points the user at the field that is not wrong.
    const target = {
      id: 'u-edit',
      email: 'edit@acme.test',
      displayName: 'Edit Person',
      role: 'EMPLOYEE',
      mustChangePassword: false,
      active: true,
      managerId: null,
      hireDate: null,
    }
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
        if (url.includes('/api/users') && init?.method === 'PATCH') {
          return Promise.resolve(json(400, { status: 400, code: 'INVALID_MANAGER' }))
        }
        if (url.includes('/api/users')) {
          return Promise.resolve(json(200, [target]))
        }
        return Promise.resolve(json(404, null))
      }),
    )

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await screen.findByRole('table')

    await user.click(screen.getAllByRole('button', { name: 'İşlemler' })[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Düzenle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('İşe giriş tarihi'), {
      target: { value: '2021-04-05' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))

    expect(
      await within(dialog).findByText('Yönetici olarak yalnızca aktif bir yönetici seçilebilir.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Yönetici' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(within(dialog).getByLabelText('İşe giriş tarihi')).not.toHaveAttribute('aria-invalid')
  })

  it('shouldShowTheBalanceAndTheLastRequestsOnTheHomeScreen', async () => {
    // L-21: the spec's home screen carries the balance card and the last requests.
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/leave/balance': () =>
        json(200, {
          entitlement: 20,
          carryover: 10,
          adjustments: 0,
          approved: 3,
          pending: 2,
          remaining: 25,
          periodStart: '2026-03-15',
          periodEnd: '2027-03-15',
          hireDate: '2020-03-15',
          entitlementDefaulted: false,
          completedYears: 6,
          hasManager: true,
          managerName: 'Manager Person',
        }),
      '/api/leave/requests': () =>
        json(200, {
          items: [
            {
              id: 'r-home',
              employeeId: 'u-hr',
              employeeName: 'HR Admin',
              type: 'ANNUAL',
              startDate: '2026-11-30',
              endDate: '2026-12-02',
              businessDays: 3,
              status: 'PENDING',
              reason: 'aile',
              decidedBy: null,
              decidedByName: null,
              decidedAt: null,
              decisionNote: null,
              createdAt: '2026-11-09T08:00:00Z',
              cancellable: false,
              cancelledAt: null,
              cancelledBy: null,
              cancelledByName: null,
              retroactive: false,
            },
          ],
          page: 1,
          size: 3,
          total: 1,
          totalPages: 1,
        }),
    })

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Son talepler')).toBeInTheDocument()
    // M-12: the list is role-scoped, so the copy must not claim it is "the requests you opened".
    expect(await screen.findByText('Son izin talepleri.')).toBeInTheDocument()
    expect(screen.queryByText('En son açtığınız izin talepleri.')).toBeNull()
    expect(await screen.findByText('Kalan')).toBeInTheDocument()
    expect(await screen.findByText(/30\.11\.2026 – 02\.12\.2026/)).toBeInTheDocument()
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()

    // The summary links to the leave screen, which is where a request is opened.
    await user.click(screen.getByRole('button', { name: 'Tüm talepleri gör' }))
    expect(await screen.findByRole('heading', { name: 'İzin talepleri' })).toBeInTheDocument()
  })

  it('shouldMarkAnInactiveUser', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/users': () =>
        json(200, [
          { ...EMPLOYEE, active: false },
          {
            ...EMPLOYEE,
            id: 'u-active',
            email: 'active@acme.test',
            displayName: 'Active Person',
            active: true,
          },
        ]),
    })

    const user = userEvent.setup()
    renderApp()
    await user.click(await navigationButton('Kullanıcılar'))

    // "Pasif" is also a stat label; the row badge is the state marker this test is about.
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Pasif')).toBeInTheDocument()

    // AC-15: the badge carries a dot as well as the word, so the state is never colour alone.
    const [inactive, active] = Array.from(
      table.querySelectorAll('tbody td[data-label="Aktif"] [data-slot="badge"]'),
    )
    expect(inactive).toHaveTextContent('Pasif')
    expect(active).toHaveTextContent('Aktif')

    const inactiveDot = inactive.querySelector('span[aria-hidden="true"]')
    const activeDot = active.querySelector('span[aria-hidden="true"]')
    if (inactiveDot === null || activeDot === null) {
      throw new Error('a status badge is missing its dot')
    }
    expect(inactiveDot).toHaveClass('bg-muted-foreground')
    expect(activeDot).toHaveClass('bg-success')
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const triggers = await screen.findAllByRole('button', { name: 'İşlemler' })
    await user.click(triggers[1])
    await user.click(await screen.findByRole('menuitem', { name: 'Pasife al' }))

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
    await user.click(await navigationButton('Kullanıcılar'))

    await user.type(await screen.findByLabelText('E-posta'), 'taken@acme.test')
    await user.type(screen.getByLabelText('Ad soyad'), 'Taken Person')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(await screen.findByText('Bu e-posta ile bir kullanıcı zaten var.')).toBeInTheDocument()
    // Announced as an alert, and the field it belongs to is marked invalid (AC-3).
    expect(screen.getByRole('alert')).toHaveTextContent('Bu e-posta ile bir kullanıcı zaten var.')
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('leave requests route', () => {
  const BALANCE = {
    entitlement: 14,
    carryover: 0,
    adjustments: 0,
    approved: 0,
    pending: 0,
    remaining: 14,
    periodStart: '2026-03-15',
    periodEnd: '2027-03-15',
    hireDate: '2020-03-15',
    entitlementDefaulted: false,
    completedYears: 6,
    hasManager: true,
    managerName: 'Manager Person',
  }
  const EMPTY_PAGE = { items: [], page: 1, size: 10, total: 0, totalPages: 0 }

  function leaveScreen() {
    authenticated(HR, () => json(200, { status: 'UP' }), {
      '/api/leave/balance': () => json(200, BALANCE),
      '/api/leave/requests': () => json(200, EMPTY_PAGE),
      '/api/users': () => json(200, []),
    })
  }

  it('shouldOpenTheLeaveRequestsScreenFromTheNavigation', async () => {
    leaveScreen()
    const user = userEvent.setup()
    renderApp()
    await screen.findByText(/Giriş yapan:/)

    await user.click(await navigationButton('İzin talepleri'))

    expect(await screen.findByRole('heading', { name: 'İzin talepleri' })).toBeInTheDocument()
    // The URL follows the screen, so a reload returns to the same route (AC-9).
    expect(window.location.pathname).toBe('/leave/requests')
    expect(await navigationButton('İzin talepleri')).toHaveAttribute('aria-current', 'page')
  })

  it('shouldOpenTheLeaveRequestsScreenFromTheUrl', async () => {
    // Opening the nested route directly: the server served the shell, the SPA picks the screen.
    window.history.replaceState({}, '', '/leave/requests')
    leaveScreen()
    renderApp()

    expect(await screen.findByRole('heading', { name: 'İzin talepleri' })).toBeInTheDocument()
    expect(await screen.findByText('Henüz izin talebiniz yok.')).toBeInTheDocument()
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

    await user.click(await navigationButton('Users'))

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

    await user.click(await navigationButton('Users'))

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument()
  })
})

describe('design system', () => {
  it('shouldRenderEveryScreenWithTheDesignSystem', async () => {
    // Every screen is built from the shared primitives: the labelled Field, the Button and — where
    // the screen reports a failure — the Alert. Card is the shared container on every screen except
    // sign-in, whose two-column layout is built on its brand panel instead (AC-13); that layout is
    // asserted in its place, so no screen escapes the structural check.
    const screens: Array<{
      name: string
      render: () => Promise<void>
      slot: 'card' | 'brand-panel'
      fields: string[]
      buttons: Array<{ name: string; scope?: 'shell' }>
      alerts?: number
    }> = [
      {
        name: 'login',
        render: async () => {
          anonymous()
          renderApp()
          await screen.findByRole('button', { name: 'Giriş yap' })
        },
        slot: 'brand-panel',
        fields: ['E-posta', 'Parola'],
        buttons: [{ name: 'Giriş yap' }],
      },
      {
        name: 'password',
        render: async () => {
          authenticated({ ...EMPLOYEE, mustChangePassword: true })
          renderApp()
          await screen.findByRole('heading', { name: 'Parola değiştirme' })
        },
        slot: 'card',
        fields: ['Mevcut parola', 'Yeni parola', 'Yeni parola (tekrar)'],
        buttons: [{ name: 'Parolayı değiştir' }],
      },
      {
        name: 'home',
        render: async () => {
          authenticated(HR)
          renderApp()
          await screen.findByText(/Giriş yapan:/)
        },
        slot: 'card',
        fields: [],
        // Both moved into the shell: "Kullanıcılar" is the sidebar item, "Çıkış" the account card.
        buttons: [
          { name: 'Kullanıcılar', scope: 'shell' },
          { name: 'Çıkış', scope: 'shell' },
        ],
      },
      {
        name: 'users',
        render: async () => {
          authenticated(HR, () => json(200, { status: 'UP' }), {
            '/api/users': () => json(200, [{ ...HR, active: true }]),
          })
          const user = userEvent.setup()
          renderApp()
          await user.click(await navigationButton('Kullanıcılar'))
          await screen.findByRole('heading', { name: 'Kullanıcılar' })
        },
        slot: 'card',
        fields: ['Ad soyad', 'E-posta'],
        buttons: [{ name: 'Oluştur' }],
      },
      {
        name: 'users error',
        render: async () => {
          authenticated(HR, () => json(200, { status: 'UP' }), {
            '/api/users': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
          })
          const user = userEvent.setup()
          renderApp()
          await user.click(await navigationButton('Kullanıcılar'))
          await screen.findByRole('alert')
        },
        slot: 'card',
        fields: ['Ad soyad', 'E-posta'],
        buttons: [{ name: 'Oluştur' }],
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
          await user.click(await navigationButton('Kullanıcılar'))
          await screen.findByRole('heading', { name: 'Bu sayfaya erişiminiz yok' })
        },
        slot: 'card',
        fields: [],
        // The old content-level "Geri" button is gone; the sidebar's "Ana ekran" is the way back.
        buttons: [{ name: 'Ana ekran', scope: 'shell' }],
      },
    ]

    for (const entry of screens) {
      cleanup()
      vi.unstubAllGlobals()
      await entry.render()
      expect(
        document.querySelectorAll(`[data-slot="${entry.slot}"]`).length,
        `${entry.name} renders its ${entry.slot}`,
      ).toBeGreaterThan(0)
      for (const label of entry.fields) {
        expect(
          screen.getByLabelText(label),
          `${entry.name} labels its "${label}" field`,
        ).toBeInTheDocument()
      }
      for (const button of entry.buttons) {
        const scope = button.scope === 'shell' ? screen.getByRole('complementary') : document.body
        expect(
          within(scope).getByRole('button', { name: button.name }),
          `${entry.name} renders the "${button.name}" button`,
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    const sidebar = screen.getByRole('complementary')
    const sidebarNav = within(sidebar).getByRole('navigation')
    // Every button in the document comes from the design system — the shell's navigation and
    // account trigger included — or is the Select trigger (Radix renders it as a button). A
    // hand-styled button would have no data-slot. The shell's semantics are checked on top of that:
    // sidebar items are real buttons inside the navigation landmark, and the account trigger
    // announces the menu it opens.
    const allowed = new Set(['button', 'select-trigger'])
    for (const button of buttons) {
      if (sidebarNav.contains(button)) {
        expect(button, button.textContent ?? '').toHaveAttribute('type', 'button')
      }
      if (button.getAttribute('aria-haspopup') === 'menu') {
        expect(button).toHaveAttribute('aria-expanded', 'false')
      }
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
    await user.click(await navigationButton('Kullanıcılar'))

    // While the request is in flight the screen shows its skeleton, not a claim that there is no user.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="users-skeleton"]')).toBeInTheDocument(),
    )
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
    await user.click(await navigationButton('Kullanıcılar'))

    // The failure is announced as an alert; the list card must not claim the list is empty.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    )
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldHaveNoAccessibilityViolationsOnTheForbiddenScreen', async () => {
    authenticated(EMPLOYEE, () => json(200, { status: 'UP' }), {
      '/api/users': () => json(403, { status: 403, code: 'NOT_AUTHORIZED' }),
    })

    const user = userEvent.setup()
    const { container } = renderApp()
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Bu sayfaya erişiminiz yok' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldReachEveryControlWithTheKeyboard', async () => {
    anonymous()

    const user = userEvent.setup()
    renderApp()

    const email = await screen.findByLabelText('E-posta')
    const password = screen.getByLabelText('Parola')
    const submit = screen.getByRole('button', { name: 'Giriş yap' })
    const turkish = screen.getByRole('button', { name: 'TR' })
    const english = screen.getByRole('button', { name: 'EN' })

    // Sign-in is its own layout (no shell around it), so the keyboard starts at the top of the
    // document; from there the tab order follows the visual order all the way to submit.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    await user.tab()
    expect(turkish).toHaveFocus()
    await user.tab()
    expect(english).toHaveFocus()
    // The theme toggle sits next to the language switch (spec 0007 AC-1).
    await user.tab()
    expect(screen.getByRole('button', { name: 'Tema' })).toHaveFocus()
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
    const email = await screen.findByLabelText('E-posta')

    // The view change focuses the content region. Wait for that effect before moving the focus by
    // hand, or it can steal focus back after `email.focus()` and the Shift+Tab starts at the top.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    // The language switch sits before the form: Shift+Tab from the first field walks back to it.
    email.focus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Tema' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'TR' })).toHaveFocus()
  })

  it('shouldShowTheThemeToggleOnTheLoginScreen', async () => {
    anonymous()
    renderApp()
    await screen.findByRole('heading', { name: 'Giriş' })
    expect(screen.getByRole('button', { name: 'Tema' })).toBeInTheDocument()
  })

  it('shouldShowTheThemeToggleInTheShell', async () => {
    authenticated(HR, () => json(200, { status: 'UP' }))
    renderApp()
    await screen.findByText(/Giriş yapan:/)
    expect(screen.getByRole('button', { name: 'Tema' })).toBeInTheDocument()
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
    await user.click(await navigationButton('Kullanıcılar'))
    await screen.findByRole('heading', { name: 'Kullanıcılar' })
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    // The page's primary action opens the content region; the form comes before the list in the
    // visual order, so the keyboard walks them in that order.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Yeni kullanıcı' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('E-posta')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Ad soyad')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveFocus()
    // The manager and hire-date fields join the form (spec 0004, AC-8) between the role and submit.
    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Yönetici' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('İşe giriş tarihi')).toHaveFocus()
    // The personal fields (D17) sit between the org data and the submit.
    await user.tab()
    expect(screen.getByLabelText('Doğum tarihi')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Okul çağında çocuğu var' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Oluştur' })).toHaveFocus()

    // The search and the role filter sit between the form and the rows; then the row actions,
    // still without a mouse.
    await user.tab()
    expect(screen.getByLabelText('İsim veya e-posta ara')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Tümü' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'İK' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Yönetici' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Çalışan' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'İşlemler' })).toHaveFocus()

    // The menu opens from the keyboard; its items are reachable and Escape returns to the trigger.
    // "Düzenle" joins the menu with the org-data edit (review round 1, L-04), ahead of the two
    // account actions; the expected list grows by that item and loses none.
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menuitem', { name: 'Düzenle' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Parola sıfırla' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Pasife al' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('button', { name: 'İşlemler' })).toHaveFocus()
  })

  it('shouldReachThePasswordScreenControlsWithTheKeyboard', async () => {
    authenticated({ ...EMPLOYEE, mustChangePassword: true })

    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Parola değiştirme' })

    // The password screen has its own layout (no shell around it), so the keyboard starts at the
    // top of the document and walks every control in visual order.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())

    await user.tab()
    expect(screen.getByRole('button', { name: 'TR' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Tema' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Mevcut parola')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Yeni parola', { exact: true })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Çıkış' })).toHaveFocus()
  })
})
