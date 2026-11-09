import { Home, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AppShell, type NavItem } from '@/app/AppShell'
import { PageHeader } from '@/app/PageHeader'
import { LoginPage } from '@/features/auth/LoginPage'
import { PasswordChangePage } from '@/features/auth/PasswordChangePage'
import { authApi, setUnauthorizedHandler, Unauthorized, type Me } from '@/features/auth/authApi'
import { roleKey } from '@/features/auth/roles'
import { HealthStatus } from '@/features/health/HealthStatus'
import { UsersPage } from '@/features/users/UsersPage'
import { useI18n } from '@/i18n/I18nProvider'
import { Avatar } from '@/ui/avatar'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'

type View = 'loading' | 'login' | 'password' | 'home' | 'users' | 'forbidden'

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
  const mainRef = useRef<HTMLElement>(null)

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

  // A view change removes the button that was clicked; move focus to the new screen so a keyboard
  // user does not restart from the top of the document.
  useEffect(() => {
    mainRef.current?.focus()
  }, [view])

  // The content region's focus ring is for keyboard users only: a mouse user never sees a box
  // around the whole page. One listener pair records the last input modality (AC-3).
  useEffect(() => {
    const root = document.documentElement
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        root.dataset.input = 'keyboard'
      }
    }
    const onPointerDown = () => {
      delete root.dataset.input
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
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

  const languageSwitch = (
    <div
      role="group"
      aria-label={t('languageLabel')}
      className="flex items-center gap-1 rounded-panel border border-border bg-card p-1"
    >
      <Button
        type="button"
        size="icon"
        variant={lang === 'tr' ? 'default' : 'ghost'}
        aria-pressed={lang === 'tr'}
        onClick={() => setLang('tr')}
      >
        TR
      </Button>
      <Button
        type="button"
        size="icon"
        variant={lang === 'en' ? 'default' : 'ghost'}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </Button>
    </div>
  )

  if (view === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <p className="text-small text-muted-foreground" role="status">
          {t('loading')}
        </p>
      </div>
    )
  }

  if (view === 'login') {
    return (
      <main ref={mainRef} tabIndex={-1} className="min-h-dvh outline-none">
        <LoginPage
          onLoggedIn={handleLoggedIn}
          onAttempt={handleLoginAttempt}
          sessionExpired={sessionExpired}
          languageSwitch={languageSwitch}
        />
      </main>
    )
  }

  if (view === 'password') {
    return (
      <main ref={mainRef} tabIndex={-1} className="min-h-dvh outline-none">
        <PasswordChangePage
          onChanged={handlePasswordChanged}
          onLogout={handleLogout}
          languageSwitch={languageSwitch}
        />
      </main>
    )
  }

  const nav: NavItem[] = [
    {
      key: 'home',
      label: t('home'),
      icon: <Home />,
      current: view === 'home',
      onSelect: () => setView('home'),
    },
    {
      key: 'users',
      label: t('users'),
      icon: <Users />,
      current: view === 'users' || view === 'forbidden',
      onSelect: () => setView('users'),
    },
  ]

  // The 403 view is the users route's outcome, so "Kullanıcılar" stays the current crumb there too;
  // a breadcrumb that marks "Ana ekran" would contradict the sidebar (AC-11).
  const breadcrumb =
    view === 'users' || view === 'forbidden' ? [t('home'), t('users')] : [t('home')]

  return (
    <AppShell
      appName={t('appTitle')}
      nav={nav}
      breadcrumb={breadcrumb}
      user={{
        displayName: me?.displayName ?? '',
        email: me?.email ?? '',
        roleLabel: me ? t(roleKey(me.role)) : '',
      }}
      labels={{
        logout: t('logout'),
        menu: t('menu'),
        close: t('close'),
        navigation: t('navigation'),
        breadcrumb: t('breadcrumb'),
      }}
      onLogout={handleLogout}
      languageSwitch={languageSwitch}
      mainRef={mainRef}
    >
      {view === 'home' && me && (
        <div className="flex flex-col gap-6">
          <PageHeader title={t('home')} description={t('homeSubtitle')} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar name={me.displayName} className="size-12 text-body" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle className="truncate">
                      {t('signedInAs')} {me.displayName}
                    </CardTitle>
                    <CardDescription className="truncate">{me.email}</CardDescription>
                  </div>
                  <Badge className="ml-auto bg-accent font-semibold tracking-normal text-accent-foreground">
                    {t(roleKey(me.role))}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
            <HealthStatus />
          </div>
        </div>
      )}

      {view === 'users' && <UsersPage onForbidden={() => setView('forbidden')} />}

      {view === 'forbidden' && (
        <div className="flex flex-col gap-6">
          <PageHeader title={t('forbiddenTitle')} description={t('forbiddenSubtitle')} />
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-small text-muted-foreground">{t('forbiddenHint')}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  )
}

export default App
