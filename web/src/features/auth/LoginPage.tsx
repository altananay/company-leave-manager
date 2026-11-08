import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Field } from '@/ui/field'
import { ApiError, authApi, type Me } from './authApi'

export function LoginPage({
  onLoggedIn,
  onAttempt,
  sessionExpired = false,
}: {
  onLoggedIn: (me: Me) => void
  onAttempt?: () => void
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
    // A new attempt replaces any previous notice (e.g. "session ended") with its own result.
    onAttempt?.()
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
    <Card>
      <CardHeader>
        <CardTitle>{t('loginTitle')}</CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {sessionExpired && <Alert variant="info">{t('sessionExpired')}</Alert>}
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field
            label={t('email')}
            type="email"
            autoComplete="username"
            value={email}
            invalid={error === 'loginFailed'}
            describedBy={error ? 'login-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Field
            label={t('password')}
            inputRef={passwordRef}
            type="password"
            autoComplete="current-password"
            value={password}
            invalid={error === 'loginFailed'}
            describedBy={error ? 'login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <Alert variant="destructive" id="login-error">
              <p className="font-medium">{t(error)}</p>
            </Alert>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('signingIn') : t('signIn')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
