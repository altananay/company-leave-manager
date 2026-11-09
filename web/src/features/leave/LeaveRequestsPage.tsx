import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { PageHeader } from '@/app/PageHeader'
import { formatDate } from '@/lib/date'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { ApiError, authApi, type Me, type User } from '@/features/auth/authApi'
import { Alert } from '@/ui/alert'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
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
import { BalanceCard } from './BalanceCard'
import { leaveErrorKey, leaveStatusKey, leaveStatusVariant, leaveTypeKey } from './format'
import { LeaveRequestForm } from './LeaveRequestForm'
import { leaveApi, type Balance, type LeaveRequest } from './leaveApi'
import { ManagerQueue } from './ManagerQueue'

const PAGE_SIZE = 10
const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function statusFilterKey(filter: StatusFilter): MessageKey {
  return filter === 'ALL' ? 'filterAll' : leaveStatusKey(filter)
}

/**
 * The leave screen (AC-6): the employee's balance and requests, a manager's approval queue and HR's
 * read-only view of every request plus the balance adjustment. The server decides what each role may
 * see; this screen renders what the API answered.
 */
function LeaveRequestsPage({ me, onForbidden }: { me: Me; onForbidden: () => void }) {
  const { t } = useI18n()
  const isManager = me.role === 'MANAGER'
  const isHr = me.role === 'HR'

  const [balance, setBalance] = useState<Balance | null>(null)
  const [balanceStatus, setBalanceStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [queue, setQueue] = useState<LeaveRequest[]>([])
  const [queueStatus, setQueueStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [employees, setEmployees] = useState<User[]>([])
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [actionError, setActionError] = useState<MessageKey | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<LeaveRequest | null>(null)
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [adjustEmployee, setAdjustEmployee] = useState('')
  const [adjustDays, setAdjustDays] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [adjustError, setAdjustError] = useState<MessageKey | null>(null)
  const [adjusted, setAdjusted] = useState<Balance | null>(null)

  const newRequestTrigger = useRef<HTMLButtonElement>(null)
  const detailTrigger = useRef<HTMLElement | null>(null)
  const cancelTrigger = useRef<HTMLElement | null>(null)
  const latestRequest = useRef(0)
  const mounted = useRef(true)
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

  const handleFailure = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 403) {
      forbiddenRef.current()
      return
    }
    setActionError(leaveErrorKey(failure))
  }, [])

  const loadBalance = useCallback(async () => {
    try {
      const result = await leaveApi.balance()
      if (!mounted.current) {
        return
      }
      setBalance(result)
      setBalanceStatus('ready')
    } catch (failure) {
      if (mounted.current) {
        setBalanceStatus('error')
        handleFailure(failure)
      }
    }
  }, [handleFailure])

  const loadList = useCallback(async () => {
    const request = ++latestRequest.current
    try {
      const result = await leaveApi.requests(
        page,
        PAGE_SIZE,
        statusFilter === 'ALL' ? undefined : statusFilter,
      )
      if (!mounted.current || request !== latestRequest.current) {
        return
      }
      setRequests(result.items)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setListStatus('ready')
    } catch (failure) {
      if (!mounted.current || request !== latestRequest.current) {
        return
      }
      setListStatus('error')
      handleFailure(failure)
    }
  }, [handleFailure, page, statusFilter])

  const loadQueue = useCallback(async () => {
    if (!isManager) {
      return
    }
    try {
      const result = await leaveApi.queue()
      if (!mounted.current) {
        return
      }
      setQueue(result)
      setQueueStatus('ready')
    } catch (failure) {
      if (mounted.current) {
        setQueueStatus('error')
        handleFailure(failure)
      }
    }
  }, [handleFailure, isManager])

  useEffect(() => {
    // The loaders await the request before they touch state, so nothing is set synchronously here.
    // eslint-disable-next-line react/set-state-in-effect
    void loadBalance()
  }, [loadBalance])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    void loadList()
  }, [loadList])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    void loadQueue()
  }, [loadQueue])

  useEffect(() => {
    if (!isHr) {
      return
    }
    let cancelled = false
    authApi
      .users()
      .then((list) => {
        if (!cancelled) {
          setEmployees(list)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [isHr])

  function reloadAll() {
    void loadBalance()
    void loadList()
    void loadQueue()
  }

  function created() {
    setNotice('leaveCreated')
    setActionError(null)
    reloadAll()
  }

  function decided() {
    setNotice('leaveDecided')
    setActionError(null)
    reloadAll()
  }

  async function cancelRequest() {
    if (!cancelling) {
      return
    }
    setCancelBusy(true)
    setActionError(null)
    try {
      await leaveApi.cancel(cancelling.id)
      setCancelling(null)
      setNotice('leaveCancelled')
      reloadAll()
    } catch (failure) {
      setActionError(leaveErrorKey(failure))
    } finally {
      setCancelBusy(false)
    }
  }

  async function adjust(event: FormEvent) {
    event.preventDefault()
    setAdjustError(null)
    setAdjusted(null)
    const days = Number(adjustDays)
    if (!Number.isInteger(days) || days === 0 || !adjustEmployee) {
      setAdjustError('validationFailed')
      return
    }
    setAdjustBusy(true)
    try {
      const result = await leaveApi.adjust(adjustEmployee, days, adjustReason)
      setAdjusted(result)
      setNotice('adjustmentDone')
      setAdjustReason('')
      setAdjustDays('')
      void loadList()
    } catch (failure) {
      setAdjustError(leaveErrorKey(failure))
    } finally {
      setAdjustBusy(false)
    }
  }

  const pageCount = Math.max(1, totalPages)
  const currentPage = Math.min(page, pageCount)
  const activeEmployees = useMemo(() => employees.filter((user) => user.active), [employees])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('leaveRequests')}
        description={t('leaveRequestsSubtitle')}
        actions={
          <Button
            type="button"
            ref={newRequestTrigger}
            disabled={balance !== null && !balance.hasManager}
            onClick={() => setFormOpen(true)}
          >
            {t('leaveNewRequest')}
          </Button>
        }
      />

      {notice && <Alert variant="success">{t(notice)}</Alert>}
      {actionError && (
        <Alert variant="destructive">
          <p className="font-medium">{t(actionError)}</p>
        </Alert>
      )}

      <BalanceCard
        balance={balance}
        loading={balanceStatus === 'loading'}
        error={balanceStatus === 'error'}
      />

      {isManager && (
        <ManagerQueue
          requests={queue}
          loading={queueStatus === 'loading'}
          error={queueStatus === 'error'}
          onDecided={decided}
        />
      )}

      {isHr && (
        <Card>
          <CardHeader>
            <CardTitle>{t('adjustmentTitle')}</CardTitle>
            <CardDescription>{t('adjustmentSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={adjust}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adjust-employee">{t('adjustmentEmployee')}</Label>
                  <Select value={adjustEmployee} onValueChange={setAdjustEmployee}>
                    <SelectTrigger id="adjust-employee">
                      <SelectValue placeholder={t('adjustmentEmployee')} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeEmployees.length === 0 && (
                    <p className="text-small text-muted-foreground">{t('leaveNoEmployees')}</p>
                  )}
                </div>
                <Field
                  label={t('adjustmentDays')}
                  type="number"
                  value={adjustDays}
                  invalid={adjustError !== null}
                  describedBy={adjustError ? 'adjustment-error' : undefined}
                  onChange={(event) => {
                    setAdjustDays(event.target.value)
                    setAdjustError(null)
                  }}
                  required
                />
              </div>
              <Field
                label={t('adjustmentReason')}
                value={adjustReason}
                maxLength={500}
                invalid={adjustError !== null}
                describedBy={adjustError ? 'adjustment-error' : undefined}
                onChange={(event) => {
                  setAdjustReason(event.target.value)
                  setAdjustError(null)
                }}
                required
              />
              {adjustError && (
                <Alert variant="destructive" id="adjustment-error">
                  <p className="font-medium">{t(adjustError)}</p>
                </Alert>
              )}
              {adjusted && (
                <Alert variant="success">
                  <p className="text-small">
                    {t('adjustmentNewRemaining')}: {adjusted.remaining} {t('leaveDaysUnit')}
                  </p>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={adjustBusy || !adjustEmployee || adjustDays === '' || !adjustReason}
                className="sm:self-start"
              >
                {t('adjustmentSave')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <CardTitle>{t('leaveListTitle')}</CardTitle>
              <CardDescription>{t('leaveListSubtitle')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('statusFilterLabel')}>
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter ? 'default' : 'secondary'}
                  aria-pressed={statusFilter === filter}
                  onClick={() => {
                    setStatusFilter(filter)
                    setPage(1)
                  }}
                >
                  {t(statusFilterKey(filter))}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listStatus === 'loading' ? (
            <div data-slot="leave-skeleton" className="flex flex-col gap-3 py-2">
              <p role="status" className="sr-only">
                {t('loading')}
              </p>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : listStatus === 'error' ? null : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-small font-medium">
                {total === 0 && statusFilter === 'ALL'
                  ? t('leaveListEmpty')
                  : t('leaveListEmptyFiltered')}
              </p>
            </div>
          ) : (
            <Table className="md:table-fixed">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>{t('leaveEmployee')}</TableHead>
                  <TableHead className="md:w-24">{t('leaveType')}</TableHead>
                  <TableHead className="md:w-44">{t('leaveDates')}</TableHead>
                  <TableHead className="md:w-20">{t('leaveBusinessDays')}</TableHead>
                  <TableHead className="md:w-24">{t('statusFilterLabel')}</TableHead>
                  <TableHead className="md:w-44">
                    <span className="sr-only">{t('actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id} className="block py-4 md:table-row md:py-0">
                    <TableCell data-label={t('leaveEmployee')} className={responsiveCell}>
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere] md:truncate">
                        {request.employeeName ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell data-label={t('leaveType')} className={responsiveCell}>
                      {t(leaveTypeKey(request.type))}
                    </TableCell>
                    <TableCell data-label={t('leaveDates')} className={responsiveCell}>
                      {formatDate(request.startDate)} – {formatDate(request.endDate)}
                    </TableCell>
                    <TableCell data-label={t('leaveBusinessDays')} className={responsiveCell}>
                      {request.businessDays}
                    </TableCell>
                    <TableCell data-label={t('statusFilterLabel')} className={responsiveCell}>
                      <Badge variant={leaveStatusVariant(request.status)}>
                        {t(leaveStatusKey(request.status))}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex flex-wrap items-center gap-2 pt-2 md:table-cell md:justify-end md:pt-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          detailTrigger.current = event.currentTarget
                          setDetail(request)
                        }}
                      >
                        {t('leaveDetails')}
                      </Button>
                      {request.employeeId === me.id && request.cancellable && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={(event) => {
                            cancelTrigger.current = event.currentTarget
                            setCancelling(request)
                          }}
                        >
                          {t('leaveCancel')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {listStatus === 'ready' && requests.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-small text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} /{' '}
                {total}
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

      <LeaveRequestForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={created}
        returnFocusTo={newRequestTrigger}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent
          closeLabel={t('close')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            detailTrigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('leaveDetailsTitle')}</DialogTitle>
            <DialogDescription>{detail?.employeeName ?? ''}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-small text-muted-foreground">{t('leaveType')}</dt>
                <dd>{t(leaveTypeKey(detail.type))}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-small text-muted-foreground">{t('leaveDates')}</dt>
                <dd>
                  {formatDate(detail.startDate)} – {formatDate(detail.endDate)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-small text-muted-foreground">{t('leaveBusinessDays')}</dt>
                <dd>{detail.businessDays}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-small text-muted-foreground">{t('statusFilterLabel')}</dt>
                <dd>
                  <Badge variant={leaveStatusVariant(detail.status)}>
                    {t(leaveStatusKey(detail.status))}
                  </Badge>
                </dd>
              </div>
              {detail.reason && (
                <div className="flex flex-col gap-1">
                  <dt className="text-small text-muted-foreground">{t('leaveReason')}</dt>
                  <dd className="text-small [overflow-wrap:anywhere]">{detail.reason}</dd>
                </div>
              )}
              {detail.retroactive && <Badge variant="muted">{t('leaveRetroactive')}</Badge>}
              <div className="flex flex-col gap-1 border-t border-border pt-2">
                <dt className="text-small text-muted-foreground">{t('leaveDecision')}</dt>
                <dd className="flex flex-col gap-1 text-small">
                  {detail.decidedAt ? (
                    <>
                      <span>
                        {t('leaveDecisionBy')}: {detail.decidedByName ?? '—'} ·{' '}
                        {t('leaveDecidedAt')}: {formatDate(detail.decidedAt.slice(0, 10))}
                      </span>
                      {detail.decisionNote && (
                        <span className="[overflow-wrap:anywhere]">
                          {t('leaveDecisionNote')}: {detail.decisionNote}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>{t('leaveNoDecision')}</span>
                  )}
                </dd>
              </div>
              {detail.cancelledAt && (
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <dt className="text-small text-muted-foreground">{t('leaveCancelledAt')}</dt>
                  <dd className="text-small">
                    {t('leaveCancelledBy')}: {detail.cancelledByName ?? '—'} ·{' '}
                    {formatDate(detail.cancelledAt.slice(0, 10))}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('close')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent
          closeLabel={t('close')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            cancelTrigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('leaveCancelTitle')}</DialogTitle>
            <DialogDescription>{t('leaveCancelDescription')}</DialogDescription>
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
              disabled={cancelBusy}
              onClick={cancelRequest}
            >
              {t('leaveCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { LeaveRequestsPage }
