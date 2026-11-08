import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { ApiError, authApi, type CreatedUser, type User } from '@/features/auth/authApi'
import { Alert } from '@/ui/alert'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { Field } from '@/ui/field'
import { Label } from '@/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

type ErrorKey =
  | 'emailExists'
  | 'roleNotAssignable'
  | 'validationFailed'
  | 'protectedAccountError'
  | 'selfAction'
  | 'genericError'

function errorKeyFor(failure: unknown): ErrorKey {
  const code = failure instanceof ApiError ? failure.code : 'ERROR'
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'emailExists'
    case 'ROLE_NOT_ASSIGNABLE':
    case 'INVALID_ROLE':
      return 'roleNotAssignable'
    case 'VALIDATION_FAILED':
      return 'validationFailed'
    case 'PROTECTED_ACCOUNT':
      return 'protectedAccountError'
    case 'SELF_ACTION_NOT_ALLOWED':
      return 'selfAction'
    default:
      return 'genericError'
  }
}

/** One responsive row: stacked card on a phone, table-like grid from `md` up (AC-4, AC-6). */
const rowClass =
  'flex flex-col gap-2 py-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_auto] md:items-center md:gap-4 md:py-3'

function UsersPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [created, setCreated] = useState<CreatedUser | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<User | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await authApi.users())
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) {
        setForbidden(true)
      } else {
        setError(errorKeyFor(failure))
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .users()
      .then((list) => {
        if (!cancelled) {
          setUsers(list)
        }
      })
      .catch((failure) => {
        if (cancelled) {
          return
        }
        if (failure instanceof ApiError && failure.status === 403) {
          setForbidden(true)
        } else {
          setError(errorKeyFor(failure))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setCreated(await authApi.createUser(email, displayName, role))
      setEmail('')
      setDisplayName('')
      await load()
    } catch (failure) {
      const key = errorKeyFor(failure)
      setError(key)
      // Focus moves to the field the user has to correct.
      if (key === 'emailExists') {
        emailRef.current?.focus()
      } else if (key === 'validationFailed') {
        displayNameRef.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  async function deactivate(user: User) {
    setError(null)
    setConfirming(null)
    try {
      await authApi.deactivate(user.id)
      await load()
    } catch (failure) {
      setError(errorKeyFor(failure))
    }
  }

  async function resetPassword(user: User) {
    setError(null)
    try {
      setCreated(await authApi.resetPassword(user.id))
      await load()
    } catch (failure) {
      setError(errorKeyFor(failure))
    }
  }

  if (forbidden) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>{t('forbiddenTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" onClick={onBack}>
            {t('back')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('usersTitle')}</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={onBack}>
              {t('back')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {created && (
            <Alert variant="success">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t('temporaryPasswordOnce')}</span>
                <code className="rounded bg-card px-2 py-1 font-mono text-sm">
                  {created.temporaryPassword}
                </code>
              </div>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <p className="font-medium">{t(error)}</p>
            </Alert>
          )}

          <form className="flex flex-col gap-4" onSubmit={create} noValidate>
            <h3 className="text-sm font-semibold">{t('newUser')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('email')}
                inputRef={emailRef}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <Field
                label={t('displayName')}
                inputRef={displayNameRef}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="new-user-role">{t('role')}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="new-user-role" aria-label={t('role')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">{t('roleEmployee')}</SelectItem>
                  <SelectItem value="MANAGER">{t('roleManager')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy} className="self-start">
              {t('create')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className={`${rowClass} hidden md:grid`} aria-hidden="true">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('displayName')}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('email')}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('role')}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('active')}
            </span>
            <span />
          </div>

          {users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              {t('noUsers')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {users.map((user) => (
                <li key={user.id} className={rowClass}>
                  <span className="font-medium md:truncate">{user.displayName}</span>
                  <span className="text-sm text-muted-foreground md:truncate">{user.email}</span>
                  <span>
                    <Badge variant="default">{t(roleKey(user.role))}</Badge>
                  </span>
                  <span>
                    <Badge variant={user.active ? 'success' : 'muted'}>
                      {user.active ? t('active') : t('inactive')}
                    </Badge>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    {isProtected(user) ? (
                      <span className="text-xs text-muted-foreground">{t('protectedAccount')}</span>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => resetPassword(user)}
                        >
                          {t('resetPassword')}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirming(user)}
                        >
                          {t('deactivate')}
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deactivate')}</DialogTitle>
            <DialogDescription>{t('confirmDeactivate')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirming && deactivate(confirming)}
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Seeded accounts are managed by the environment, not by this screen (spec 0002, AC-6). */
function isProtected(user: User): boolean {
  return user.role === 'HR' || user.role === 'CEO'
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

export { UsersPage }
