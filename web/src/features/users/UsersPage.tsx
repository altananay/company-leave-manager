import { MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { PageHeader } from '@/app/PageHeader'
import { useI18n } from '@/i18n/I18nProvider'
import { ApiError, authApi, type CreatedUser, type Role, type User } from '@/features/auth/authApi'
import { roleKey } from '@/features/auth/roles'
import { Alert } from '@/ui/alert'
import { Avatar } from '@/ui/avatar'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Field } from '@/ui/field'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  responsiveCell,
} from '@/ui/table'
import { formatDate } from '@/lib/date'

type ErrorKey =
  | 'emailExists'
  | 'roleNotAssignable'
  | 'validationFailed'
  | 'protectedAccountError'
  | 'selfAction'
  | 'invalidManager'
  | 'managerHasReports'
  | 'managerHasPendingRequests'
  | 'invalidHireDate'
  | 'hireDateWouldGoNegative'
  | 'genericError'

/** The edit dialog's two fields: the refusal has to land on the field it is about (M-13). */
type EditField = 'manager' | 'hireDate'

type EditError = { key: ErrorKey; field: EditField | null }

/** How many rows one page holds. A thousand accounts are not a scroll, they are pages (AC-14). */
const PAGE_SIZE = 10

type RoleFilter = 'ALL' | Role

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
    case 'INVALID_MANAGER':
      return 'invalidManager'
    case 'MANAGER_HAS_REPORTS':
      return 'managerHasReports'
    case 'MANAGER_HAS_PENDING_REQUESTS':
      return 'managerHasPendingRequests'
    case 'INVALID_HIRE_DATE':
      return 'invalidHireDate'
    case 'USER_EDIT_WOULD_GO_NEGATIVE':
      return 'hireDateWouldGoNegative'
    default:
      return 'genericError'
  }
}

/**
 * Which field of the edit dialog a refusal belongs to (M-13): an invalid manager is not a bad hire
 * date, and marking both fields invalid tells the user to fix the wrong one.
 */
function editErrorFor(failure: unknown): EditError {
  const key = errorKeyFor(failure)
  switch (key) {
    case 'invalidManager':
    case 'managerHasPendingRequests':
      return { key, field: 'manager' }
    case 'invalidHireDate':
    case 'hireDateWouldGoNegative':
    case 'validationFailed':
      return { key, field: 'hireDate' }
    default:
      return { key, field: null }
  }
}

/**
 * Under md the table becomes a stack of cards: each cell prints its column name with `before:`.
 * The rule lives in the design system so every table prints it the same way.
 */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-1">
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-display">{value}</p>
    </div>
  )
}

function UsersPage({ onForbidden }: { onForbidden: () => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [created, setCreated] = useState<CreatedUser | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [managerId, setManagerId] = useState('NONE')
  const [hireDate, setHireDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<User | null>(null)
  // The org-data edit (review round 1, L-04): manager + hire date, one account at a time.
  const [editing, setEditing] = useState<User | null>(null)
  const [editManagerId, setEditManagerId] = useState('NONE')
  const [editHireDate, setEditHireDate] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<EditError | null>(null)
  const [notice, setNotice] = useState<'usersUpdated' | null>(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [page, setPage] = useState(1)
  const emailRef = useRef<HTMLInputElement>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)
  // The button that opened the dialog, so focus can return to it when the dialog closes.
  const deactivateTrigger = useRef<HTMLElement | null>(null)
  const editTrigger = useRef<HTMLElement | null>(null)
  // The newest list request: an older answer must not overwrite it.
  const latestRequest = useRef(0)
  // The screen is unmounted when the user goes back: an answer that arrives later must be dropped.
  const mounted = useRef(true)
  // The forbidden callback lives in a ref: `load` must not re-run because App re-rendered.
  const forbiddenRef = useRef(onForbidden)

  useEffect(() => {
    forbiddenRef.current = onForbidden
  }, [onForbidden])

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
        forbiddenRef.current()
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
      setCreated(
        await authApi.createUser(
          email,
          displayName,
          role,
          managerId === 'NONE' ? null : managerId,
          hireDate || null,
        ),
      )
      setEmail('')
      setDisplayName('')
      setManagerId('NONE')
      setHireDate('')
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

  function openEdit(user: User) {
    setEditError(null)
    setNotice(null)
    setEditManagerId(user.managerId ?? 'NONE')
    setEditHireDate(user.hireDate ?? '')
    setEditing(user)
  }

  /** Saves the manager link and the hire date; the server validates the manager and the cycle. */
  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) {
      return
    }
    setEditBusy(true)
    setEditError(null)
    try {
      await authApi.updateUser(
        editing.id,
        editManagerId === 'NONE' ? null : editManagerId,
        editHireDate || null,
      )
      setEditing(null)
      setNotice('usersUpdated')
      await load()
    } catch (failure) {
      setEditError(editErrorFor(failure))
    } finally {
      setEditBusy(false)
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
    error === 'emailExists' ||
    error === 'validationFailed' ||
    error === 'roleNotAssignable' ||
    error === 'invalidManager'

  // Only an active MANAGER can be assigned: BR-7 makes any other choice an approver who could never
  // approve, and the server refuses it with INVALID_MANAGER.
  const managerOptions = useMemo(
    () => users.filter((user) => user.role === 'MANAGER' && user.active),
    [users],
  )
  // An account cannot be its own manager; the server refuses it too, this only hides the choice.
  const editManagerChoices = useMemo(
    () => managerOptions.filter((manager) => manager.id !== editing?.id),
    [managerOptions, editing],
  )

  const active = users.filter((user) => user.active).length
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    return users.filter((user) => {
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter
      const matchesQuery =
        needle.length === 0 ||
        user.displayName.toLocaleLowerCase('tr').includes(needle) ||
        user.email.toLocaleLowerCase('tr').includes(needle)
      return matchesRole && matchesQuery
    })
  }, [users, query, roleFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function filterByRole(next: RoleFilter) {
    setRoleFilter(next)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('usersTitle')}
        description={t('usersSubtitle')}
        actions={
          <Button type="button" onClick={() => emailRef.current?.focus()}>
            {t('newUser')}
          </Button>
        }
      />

      {created && (
        <Alert variant="success">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t('temporaryPasswordOnce')}</span>
            <code className="rounded-chip bg-card px-2 py-1 font-mono text-small">
              {created.temporaryPassword}
            </code>
          </div>
        </Alert>
      )}
      {notice && <Alert variant="success">{t(notice)}</Alert>}
      {error && !formError && (
        <Alert variant="destructive" id="users-error">
          <p className="font-medium">{t(error)}</p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('newUser')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={create}>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role-trigger">{t('role')}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="role-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">{t('roleEmployee')}</SelectItem>
                    <SelectItem value="MANAGER">{t('roleManager')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manager-trigger">{t('manager')}</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger id="manager-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t('managerNone')}</SelectItem>
                    {managerOptions.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[12rem_auto] sm:items-end">
              <Field
                label={t('hireDate')}
                type="date"
                value={hireDate}
                describedBy={formError ? 'users-error' : undefined}
                onChange={(event) => setHireDate(event.target.value)}
              />
              <Button type="submit" disabled={busy} className="sm:justify-self-start">
                {t('create')}
              </Button>
            </div>
            {formError && (
              <Alert variant="destructive" id="users-error">
                <p className="font-medium">{t(error)}</p>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('statTotal')} value={users.length} />
        <Stat label={t('statActive')} value={active} />
        <Stat label={t('statInactive')} value={users.length - active} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="user-search" className="sr-only">
                {t('searchUsers')}
              </Label>
              <Input
                id="user-search"
                type="search"
                value={query}
                placeholder={t('searchUsers')}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('role')}>
              {(['ALL', 'HR', 'MANAGER', 'EMPLOYEE'] as RoleFilter[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={roleFilter === value ? 'default' : 'secondary'}
                  aria-pressed={roleFilter === value}
                  onClick={() => filterByRole(value)}
                  className="min-w-11"
                >
                  {value === 'ALL' ? t('allRoles') : t(roleKey(value))}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {status === 'loading' ? (
            <div className="flex flex-col gap-3 py-2" data-slot="users-skeleton">
              {/* The skeleton is aria-hidden, so the loading state needs its own announcement. */}
              <p role="status" className="sr-only">
                {t('loading')}
              </p>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : status === 'error' ? null : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-small font-medium">
                {users.length === 0 ? t('noUsers') : t('noResults')}
              </p>
            </div>
          ) : (
            <Table className="md:table-fixed">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>{t('displayName')}</TableHead>
                  <TableHead className="md:w-20">{t('role')}</TableHead>
                  <TableHead className="md:w-36">{t('manager')}</TableHead>
                  <TableHead className="md:w-24">{t('hireDate')}</TableHead>
                  <TableHead className="md:w-20">{t('active')}</TableHead>
                  <TableHead className="md:w-32">
                    <span className="sr-only">{t('actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((user) => (
                  <TableRow key={user.id} className="block py-4 md:table-row md:py-0">
                    <TableCell data-label={t('displayName')} className={responsiveCell}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={user.displayName} className="md:size-8" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium [overflow-wrap:anywhere] md:truncate">
                            {user.displayName}
                          </span>
                          <span className="text-small text-muted-foreground [overflow-wrap:anywhere] md:truncate">
                            {user.email}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell data-label={t('role')} className={responsiveCell}>
                      <Badge variant="default">{t(roleKey(user.role))}</Badge>
                    </TableCell>
                    <TableCell data-label={t('manager')} className={responsiveCell}>
                      <span className="min-w-0 [overflow-wrap:anywhere] md:truncate">
                        {users.find((candidate) => candidate.id === user.managerId)?.displayName ??
                          '—'}
                      </span>
                    </TableCell>
                    <TableCell data-label={t('hireDate')} className={responsiveCell}>
                      {formatDate(user.hireDate)}
                    </TableCell>
                    <TableCell data-label={t('active')} className={responsiveCell}>
                      <Badge variant={user.active ? 'success' : 'muted'} className="gap-1.5">
                        {/* AC-15: the status is a dot and a word, never colour alone. */}
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-pill ${
                            user.active ? 'bg-success' : 'bg-muted-foreground'
                          }`}
                        />
                        {user.active ? t('active') : t('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex flex-wrap items-center gap-2 pt-2 md:table-cell md:justify-end md:pt-0">
                      {user.role === 'HR' || user.role === 'CEO' ? (
                        <span className="text-small text-muted-foreground">
                          {t('protectedAccount')}
                        </span>
                      ) : (
                        // Row actions live behind one menu (AC-14), so the table stays quiet and the
                        // protected rows above cannot be mistaken for actionable ones.
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t('actions')}
                              onClick={(event) => {
                                // The dialog must return focus here, not to the menu item that is
                                // gone by the time it closes (AC-3).
                                deactivateTrigger.current = event.currentTarget
                              }}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onSelect={() => {
                                editTrigger.current = deactivateTrigger.current
                                openEdit(user)
                              }}
                            >
                              {t('usersEdit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => resetPassword(user)}>
                              {t('resetPassword')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setConfirming(user)}
                            >
                              {t('deactivate')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {status === 'ready' && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-small text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} / {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  {t('previousPage')}
                </Button>
                <span className="text-small text-muted-foreground">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                >
                  {t('nextPage')}
                </Button>
              </div>
            </div>
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent
          closeLabel={t('close')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            editTrigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('usersEditTitle')}</DialogTitle>
            <DialogDescription>{t('usersEditDescription')}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form className="flex flex-col gap-4" onSubmit={saveEdit}>
              <p className="text-small font-medium">
                {editing.displayName} · {editing.email}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-manager-trigger">{t('manager')}</Label>
                <Select value={editManagerId} onValueChange={setEditManagerId}>
                  <SelectTrigger
                    id="edit-manager-trigger"
                    // M-13: only the field the refusal is about carries the invalid state.
                    aria-invalid={editError?.field === 'manager' || undefined}
                    aria-describedby={
                      editError?.field === 'manager' ? 'edit-user-error' : undefined
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t('managerNone')}</SelectItem>
                    {editManagerChoices.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                label={t('hireDate')}
                type="date"
                value={editHireDate}
                invalid={editError?.field === 'hireDate'}
                describedBy={editError?.field === 'hireDate' ? 'edit-user-error' : undefined}
                onChange={(event) => {
                  setEditHireDate(event.target.value)
                  setEditError(null)
                }}
              />
              {editError && (
                <Alert variant="destructive" id="edit-user-error">
                  <p className="font-medium">{t(editError.key)}</p>
                </Alert>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={editBusy}>
                  {t('usersEditSave')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { UsersPage }
