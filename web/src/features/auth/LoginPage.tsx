import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Field } from '@/ui/field'
import { ApiError, authApi, type Me } from './authApi'

/**
 * Sign-in is the first thing anyone sees, so it gets a real layout (AC-13): the brand panel on the
 * left from 1024 px up, the form on the right. Below that the panel is hidden and the form takes the
 * whole width — same fields, same messages, same behaviour as before.
 */
export function LoginPage({
  onLoggedIn,
  onAttempt,
  sessionExpired = false,
  languageSwitch,
}: {
  onLoggedIn: (me: Me) => void
  onAttempt?: () => void
  sessionExpired?: boolean
  languageSwitch?: ReactNode
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
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      <section
        aria-hidden="true"
        data-slot="brand-panel"
        className="brand-panel relative hidden flex-col overflow-hidden p-10 text-primary-foreground lg:flex"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-panel border border-primary-foreground/25 bg-primary-foreground/15 text-small font-bold backdrop-blur-sm">
            İY
          </span>
          <span className="text-h2 font-semibold tracking-tight">{t('appTitle')}</span>
        </div>

        <div className="mt-auto max-w-[34ch]">
          <h2 className="text-display">{t('loginPitch')}</h2>
          <p className="mt-3 text-small text-primary-foreground/75">{t('loginPitchBody')}</p>
          <ul className="mt-7 flex flex-col gap-2.5 text-small text-primary-foreground/85">
            <li className="flex items-center gap-2.5">
              <span className="grid size-4.5 place-items-center rounded-pill bg-primary-foreground/15 text-label">
                ✓
              </span>
              {t('loginPointRoles')}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="grid size-4.5 place-items-center rounded-pill bg-primary-foreground/15 text-label">
                ✓
              </span>
              {t('loginPointAudit')}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="grid size-4.5 place-items-center rounded-pill bg-primary-foreground/15 text-label">
                ✓
              </span>
              {t('loginPointMobile')}
            </li>
          </ul>
        </div>

        {/* 70 %, not 55 %: the footer must clear 4.5:1 against even the lightest gradient stop
            (`shouldKeepTheBrandPanelTextReadable` measures it). */}
        <p className="mt-8 text-label font-medium tracking-normal text-primary-foreground/70">
          {t('appTitle')} · {t('internalOnly')}
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center justify-between gap-3 lg:justify-end">
            <span className="flex items-center gap-2 lg:hidden">
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

          <h1 className="text-h1 font-semibold">{t('loginTitle')}</h1>
          <p className="mt-2 text-small text-muted-foreground">{t('loginSubtitle')}</p>

          <div className="mt-7 flex flex-col gap-4">
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
              <Button type="submit" disabled={busy} className="w-full" size="lg">
                {busy ? t('signingIn') : t('signIn')}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
