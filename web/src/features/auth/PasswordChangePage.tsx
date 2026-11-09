import { useRef, useState, type FormEvent, type ReactNode } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Field } from '@/ui/field'
import { ApiError, authApi } from './authApi'

type ErrorKey = 'passwordTooShort' | 'passwordMismatch' | 'invalidPassword' | 'genericError'

export function PasswordChangePage({
  onChanged,
  onLogout,
  languageSwitch,
}: {
  onChanged: () => void
  onLogout: () => void
  languageSwitch?: ReactNode
}) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [busy, setBusy] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  /** Focus moves to the field the user has to correct. */
  function fail(key: ErrorKey) {
    setError(key)
    if (key === 'invalidPassword') {
      currentRef.current?.focus()
    } else if (key === 'passwordTooShort') {
      nextRef.current?.focus()
    } else if (key === 'passwordMismatch') {
      confirmRef.current?.focus()
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (next.length < 12) {
      fail('passwordTooShort')
      return
    }
    if (next !== confirm) {
      fail('passwordMismatch')
      return
    }
    setBusy(true)
    try {
      await authApi.changePassword(current, next, confirm)
      onChanged()
    } catch (failure) {
      // The API answers with a stable English code; the UI never parses prose.
      const code = failure instanceof ApiError ? failure.code : 'ERROR'
      fail(
        code === 'INVALID_PASSWORD'
          ? 'invalidPassword'
          : code === 'PASSWORD_MISMATCH'
            ? 'passwordMismatch'
            : code === 'WEAK_PASSWORD'
              ? 'passwordTooShort'
              : 'genericError',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="brand-action grid size-8 place-items-center rounded-panel text-label font-bold text-primary-foreground"
          >
            İY
          </span>
          <span className="text-small font-semibold">{t('appTitle')}</span>
        </span>
        {languageSwitch}
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>{t('passwordTitle')}</CardTitle>
              <CardDescription>{t('passwordSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={submit}>
                <Field
                  label={t('currentPassword')}
                  inputRef={currentRef}
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  invalid={error === 'invalidPassword'}
                  describedBy={error ? 'password-error' : undefined}
                  onChange={(event) => setCurrent(event.target.value)}
                  required
                />
                <Field
                  label={t('newPassword')}
                  inputRef={nextRef}
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  invalid={error === 'passwordTooShort'}
                  describedBy={error ? 'password-error' : undefined}
                  onChange={(event) => setNext(event.target.value)}
                  required
                />
                <Field
                  label={t('confirmPassword')}
                  inputRef={confirmRef}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  invalid={error === 'passwordMismatch'}
                  describedBy={error ? 'password-error' : undefined}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                />
                {error && (
                  <Alert variant="destructive" id="password-error">
                    <p className="font-medium">{t(error)}</p>
                  </Alert>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={busy} className="sm:flex-1">
                    {t('savePassword')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={onLogout} disabled={busy}>
                    {t('logout')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
