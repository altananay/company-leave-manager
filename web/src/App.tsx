import { useEffect, useRef, useState } from 'react'

import { LoginPage } from '@/features/auth/LoginPage'
import { PasswordChangePage } from '@/features/auth/PasswordChangePage'
import { authApi, setUnauthorizedHandler, Unauthorized, type Me } from '@/features/auth/authApi'
import { roleKey } from '@/features/auth/roles'
import { HealthStatus } from '@/features/health/HealthStatus'
import { UsersPage } from '@/features/users/UsersPage'
import { useI18n } from '@/i18n/I18nProvider'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'

type View = 'loading' | 'login' | 'password' | 'home' | 'users'

// Per-tab marker in sessionStorage (not memory) so the state survives a reload in this tab.
// '1' = this tab had a session; 'expired' = a 401 ended it and the notice is still owed.
const SESSION_MARKER = 'leave-manager.had-session'
const HAD_SESSION = '1'
const SESSION_ENDED = 'expired'

function sessionMarker() {
  return sessionStorage.getItem(SESSION_MARKER)
}

function rememberSession(state: '1' | 'expired' | null) {
  if (state) {
    sessionStorage.setItem(SESSION_MARKER, state)
  } else {
    sessionStorage.removeItem(SESSION_MARKER)
  }
}

function App() {
  const { lang, setLang, t } = useI18n()
  const [view, setView] = useState<View>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Latch: a 401 only ever raises the notice. A second in-flight 401 must not clear what the
      // first one showed, and the marker keeps the notice across a reload (spec 0002, "Hata davranışı").
      if (sessionMarker() === HAD_SESSION) {
        rememberSession(SESSION_ENDED)
      }
      if (sessionMarker() === SESSION_ENDED) {
        setSessionExpired(true)
      }
      setMe(null)
      setView('login')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then((current) => {
        if (cancelled) {
          return
        }
        rememberSession(HAD_SESSION)
        setMe(current)
        setView(current.mustChangePassword ? 'password' : 'home')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        // The probe failed without a 401 (500, network): the marker is stale — a later failed
        // login must not claim that the session ended (spec 0002, "Hata davranışı").
        if (sessionMarker() === HAD_SESSION) {
          rememberSession(null)
        }
        setView('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleLoggedIn(current: Me) {
    rememberSession(HAD_SESSION)
    setSessionExpired(false)
    setMe(current)
    setView(current.mustChangePassword ? 'password' : 'home')
  }

  async function handleLogout() {
    // A second click while the first request is in flight would race with it.
    if (loggingOut) {
      return
    }
    setLoggingOut(true)
    // If the session was already gone, the 401 handler has just explained that: keep its notice.
    const lost = await authApi
      .logout()
      .then(() => false)
      .catch((failure) => failure instanceof Unauthorized)
    rememberSession(lost ? SESSION_ENDED : null)
    setLoggingOut(false)
    setMe(null)
    setSessionExpired(lost)
    setView('login')
  }

  /** A new attempt on the login screen replaces the "session ended" notice with its own result. */
  function handleLoginAttempt() {
    rememberSession(null)
    setSessionExpired(false)
  }

  function handlePasswordChanged() {
    setMe((current) => (current ? { ...current, mustChangePassword: false } : current))
    setView('home')
  }

  const centered = view === 'login' || view === 'password' || view === 'loading'
  const mainRef = useRef<HTMLElement>(null)

  // A view change removes the button that was clicked; move focus to the new screen so a keyboard
  // user does not restart from the top of the document.
  useEffect(() => {
    mainRef.current?.focus()
  }, [view])

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      {/* A quiet accent behind the content; decoration only, so it never carries meaning. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-primary/5 blur-3xl"
      />
      <header className="relative border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm"
            >
              İY
            </span>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{t('appTitle')}</h1>
          </div>
          <div
            role="group"
            aria-label={t('languageLabel')}
            className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
          >
            <Button
              type="button"
              size="icon"
              variant={lang === 'tr' ? 'default' : 'ghost'}
              aria-pressed={lang === 'tr'}
              onClick={() => setLang('tr')}
              className="text-xs"
            >
              TR
            </Button>
            <Button
              type="button"
              size="icon"
              variant={lang === 'en' ? 'default' : 'ghost'}
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
              className="text-xs"
            >
              EN
            </Button>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        tabIndex={-1}
        className={
          centered
            ? 'relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 outline-none sm:px-6'
            : 'relative mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none sm:px-6'
        }
      >
        {view === 'loading' && (
          <p className="text-center text-sm text-muted-foreground" role="status">
            {t('loading')}
          </p>
        )}

        {view === 'login' && (
          <LoginPage
            onLoggedIn={handleLoggedIn}
            onAttempt={handleLoginAttempt}
            sessionExpired={sessionExpired}
          />
        )}

        {view === 'password' && (
          <PasswordChangePage onChanged={handlePasswordChanged} onLogout={handleLogout} />
        )}

        {view === 'home' && me && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-semibold text-primary"
                  >
                    {initials(me.displayName)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle className="truncate">
                      {t('signedInAs')} {me.displayName}
                    </CardTitle>
                    <CardDescription className="truncate">{me.email}</CardDescription>
                  </div>
                  <Badge variant="success" className="sm:ml-auto">
                    {t(roleKey(me.role))}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => setView('users')}>
                    {t('users')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {t('logout')}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <HealthStatus />
          </div>
        )}

        {view === 'users' && <UsersPage onBack={() => setView('home')} />}
      </main>
    </div>
  )
}

/** Up to two initials for the avatar circle; falls back to the first character of the address. */
function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('')
}

export default App
