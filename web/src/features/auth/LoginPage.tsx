import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { ApiError, authApi, type Me } from './authApi'

export function LoginPage({
  onLoggedIn,
  sessionExpired = false,
}: {
  onLoggedIn: (me: Me) => void
  sessionExpired?: boolean
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<'loginFailed' | 'accountLocked' | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Accessibility: focus moves to the field the user has to correct.
  useEffect(() => {
    if (error) {
      passwordRef.current?.focus()
    }
  }, [error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onLoggedIn(await authApi.login(email, password))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 423) {
        setError('accountLocked')
      } else {
        setError('loginFailed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('loginTitle')}</h2>
      {sessionExpired && (
        <p className="notice" role="status">
          {t('sessionExpired')}
        </p>
      )}
      <label>
        {t('email')}
        <input
          type="email"
          autoComplete="username"
          value={email}
          aria-invalid={error === 'loginFailed'}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        {t('password')}
        <input
          ref={passwordRef}
          type="password"
          autoComplete="current-password"
          value={password}
          aria-invalid={error === 'loginFailed'}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? t('signingIn') : t('signIn')}
      </button>
    </form>
  )
}
