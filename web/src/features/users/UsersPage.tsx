import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import { ApiError, authApi, type CreatedUser, type User } from '@/features/auth/authApi'
import { roleKey } from '@/features/auth/roles'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

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

function UsersPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
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
  // The button that opened the dialog, so focus can return to it when the dialog closes.
  const deactivateTrigger = useRef<HTMLElement | null>(null)
  // The newest list request: an older answer must not overwrite it.
  const latestRequest = useRef(0)
  // The screen is unmounted when the user goes back: an answer that arrives later must be dropped.
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    // A slow first request must not overwrite a newer list (e.g. right after a create).
    const request = ++latestRequest.current
    try {
      const list = await authApi.users()
      if (!mounted.current || request !== latestRequest.current) {
        return
      }
      setUsers(list)
      setStatus('ready')
    } catch (failure) {
      if (!mounted.current || request !== latestRequest.current) {
        return
      }
      setStatus('error')
      if (failure instanceof ApiError && failure.status === 403) {
        setForbidden(true)
      } else {
        setError(errorKeyFor(failure))
      }
    }
  }, [])

  useEffect(() => {
    // `load` awaits the request before it touches state, so nothing is set synchronously here.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

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

  /** True when the error belongs to the create form, not to a row action. */
  const formError =
    error === 'emailExists' || error === 'validationFailed' || error === 'roleNotAssignable'

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
            <Alert variant="destructive" id="users-error">
              <p className="font-medium">{t(error)}</p>
            </Alert>
          )}

          <form className="flex flex-col gap-4" onSubmit={create}>
            <h3 className="text-sm font-semibold">{t('newUser')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('email')}
                inputRef={emailRef}
                type="email"
                value={email}
                invalid={error === 'emailExists' || error === 'validationFailed'}
                describedBy={formError ? 'users-error' : undefined}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <Field
                label={t('displayName')}
                inputRef={displayNameRef}
                value={displayName}
                invalid={error === 'validationFailed'}
                describedBy={formError ? 'users-error' : undefined}
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
          {status === 'loading' ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              {t('loading')}
            </p>
          ) : status === 'error' ? null : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              {t('noUsers')}
            </p>
          ) : (
            <Table>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>{t('displayName')}</TableHead>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{t('role')}</TableHead>
                  <TableHead>{t('active')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="block py-4 md:table-row md:py-0">
                    <TableCell
                      data-label={t('displayName')}
                      className="flex items-baseline justify-between gap-4 py-1 before:text-xs before:font-semibold before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none"
                    >
                      <span className="font-medium md:truncate">{user.displayName}</span>
                    </TableCell>
                    <TableCell
                      data-label={t('email')}
                      className="flex items-baseline justify-between gap-4 py-1 before:text-xs before:font-semibold before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none"
                    >
                      <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere] md:max-w-[16rem] md:truncate">
                        {user.email}
                      </span>
                    </TableCell>
                    <TableCell
                      data-label={t('role')}
                      className="flex items-baseline justify-between gap-4 py-1 before:text-xs before:font-semibold before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none"
                    >
                      <Badge variant="default">{t(roleKey(user.role))}</Badge>
                    </TableCell>
                    <TableCell
                      data-label={t('active')}
                      className="flex items-baseline justify-between gap-4 py-1 before:text-xs before:font-semibold before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none"
                    >
                      <Badge variant={user.active ? 'success' : 'muted'}>
                        {user.active ? t('active') : t('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex flex-wrap items-center gap-2 pt-2 md:table-cell md:justify-end md:pt-0">
                      {isProtected(user) ? (
                        <span className="text-xs text-muted-foreground">
                          {t('protectedAccount')}
                        </span>
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
                            onClick={(event) => {
                              deactivateTrigger.current = event.currentTarget
                              setConfirming(user)
                            }}
                          >
                            {t('deactivate')}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent
          closeLabel={t('close')}
          // Radix would drop focus on <body> because this dialog has no DialogTrigger; send it
          // back to the row button that opened it (AC-3).
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            deactivateTrigger.current?.focus()
          }}
        >
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

export { UsersPage }
