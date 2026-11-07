import { useEffect, useState } from 'react'
import { LoginPage } from './features/auth/LoginPage'
import { PasswordChangePage } from './features/auth/PasswordChangePage'
import { authApi, setUnauthorizedHandler, Unauthorized, type Me } from './features/auth/authApi'
import { HealthStatus } from './features/health/HealthStatus'
import { UsersPage } from './features/users/UsersPage'
import { useI18n } from './i18n/I18nProvider'
import type { MessageKey } from './i18n/messages'

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
    // If the session was already gone, the 401 handler has just explained that: keep its notice.
    const lost = await authApi
      .logout()
      .then(() => false)
      .catch((failure) => failure instanceof Unauthorized)
    rememberSession(lost ? SESSION_ENDED : null)
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
