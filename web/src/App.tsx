import { useEffect, useState } from 'react'
import { LoginPage } from './features/auth/LoginPage'
import { PasswordChangePage } from './features/auth/PasswordChangePage'
import { authApi, setUnauthorizedHandler, type Me } from './features/auth/authApi'
import { HealthStatus } from './features/health/HealthStatus'
import { UsersPage } from './features/users/UsersPage'
import { useI18n } from './i18n/I18nProvider'
import type { MessageKey } from './i18n/messages'

type View = 'loading' | 'login' | 'password' | 'home' | 'users'

// Per-tab marker: a session existed in this tab. sessionStorage (not memory) so a reload after the
// session ended still shows "your session ended" instead of pretending it is a first visit.
const SESSION_MARKER = 'leave-manager.had-session'

function hadSessionMarker() {
  return sessionStorage.getItem(SESSION_MARKER) === '1'
}

function rememberSession(remember: boolean) {
  if (remember) {
    sessionStorage.setItem(SESSION_MARKER, '1')
  } else {
    sessionStorage.removeItem(SESSION_MARKER)
  }
}

function App() {
  const { lang, setLang, t } = useI18n()
  const [view, setView] = useState<View>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // A 401 means "your session ended" only if this tab had a session: an anonymous first visit
      // and a failed login are ordinary 401s (spec 0002, "Hata davranışı").
      setSessionExpired(hadSessionMarker())
      rememberSession(false)
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
        rememberSession(true)
        setMe(current)
        setView(current.mustChangePassword ? 'password' : 'home')
      })
      .catch(() => {
        if (!cancelled) {
          setView('login')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleLoggedIn(current: Me) {
    rememberSession(true)
    setSessionExpired(false)
    setMe(current)
    setView(current.mustChangePassword ? 'password' : 'home')
  }

  async function handleLogout() {
    await authApi.logout().catch(() => undefined)
    rememberSession(false)
    setMe(null)
    setSessionExpired(false)
    setView('login')
  }

  /** A new attempt on the login screen replaces the "session ended" notice with its own result. */
  function handleLoginAttempt() {
    setSessionExpired(false)
  }

  function handlePasswordChanged() {
    setMe((current) => (current ? { ...current, mustChangePassword: false } : current))
    setView('home')
  }

  return (
    <main className="shell">
      <header className="shell-header">
        <h1>{t('appTitle')}</h1>
        <div className="lang-switch" role="group" aria-label={t('languageLabel')}>
          <button type="button" aria-pressed={lang === 'tr'} onClick={() => setLang('tr')}>
            TR
          </button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
      </header>

      {view === 'loading' && <p>{t('loading')}</p>}

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
        <>
          <p className="signed-in">
            {t('signedInAs')} {me.displayName} ({t(roleKey(me.role))})
          </p>
          <div className="actions">
            <button type="button" onClick={() => setView('users')}>
              {t('users')}
            </button>
            <button type="button" className="secondary" onClick={handleLogout}>
              {t('logout')}
            </button>
          </div>
          <HealthStatus />
        </>
      )}

      {view === 'users' && <UsersPage onBack={() => setView('home')} />}
    </main>
  )
}

function roleKey(role: string): MessageKey {
  switch (role) {
    case 'HR':
      return 'roleHr'
    case 'CEO':
      return 'roleCeo'
    case 'MANAGER':
      return 'roleManager'
    default:
      return 'roleEmployee'
  }
}

export default App
