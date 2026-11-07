import { useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { ApiError, authApi } from './authApi'

type ErrorKey = 'passwordTooShort' | 'passwordMismatch' | 'invalidPassword' | 'genericError'

export function PasswordChangePage({
  onChanged,
  onLogout,
}: {
  onChanged: () => void
  onLogout: () => void
}) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [busy, setBusy] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (next.length < 12) {
      setError('passwordTooShort')
      return
    }
    if (next !== confirm) {
      setError('passwordMismatch')
      return
    }
    setBusy(true)
    try {
      await authApi.changePassword(current, next, confirm)
      onChanged()
    } catch (failure) {
      // The API answers with a stable English code; the UI never parses prose.
      const code = failure instanceof ApiError ? failure.code : 'ERROR'
      setError(
        code === 'INVALID_PASSWORD'
          ? 'invalidPassword'
          : code === 'PASSWORD_MISMATCH'
            ? 'passwordMismatch'
            : code === 'WEAK_PASSWORD'
              ? 'passwordTooShort'
              : 'genericError',
      )
      currentRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('passwordTitle')}</h2>
      <label>
        {t('currentPassword')}
        <input
          ref={currentRef}
          type="password"
          autoComplete="current-password"
          value={current}
          aria-invalid={error === 'invalidPassword'}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </label>
      <label>
        {t('newPassword')}
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          aria-invalid={error === 'passwordTooShort'}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </label>
      <label>
        {t('confirmPassword')}
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          aria-invalid={error === 'passwordMismatch'}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {t('savePassword')}
      </button>
      <button type="button" className="secondary" onClick={onLogout}>
        {t('logout')}
      </button>
    </form>
  )
}
