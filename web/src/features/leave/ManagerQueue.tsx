import { useRef, useState } from 'react'

import { formatDate } from '@/lib/date'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
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
import { Skeleton } from '@/ui/skeleton'
import { leaveErrorKey, leaveTypeKey } from './format'
import { leaveApi, type LeaveRequest } from './leaveApi'

type Decision = { request: LeaveRequest; approve: boolean }

/**
 * The manager queue (AC-6, BR-7): the pending requests of the direct reports, approved or rejected
 * from here. Both actions open a dialog — approval confirms, rejection requires its reason — and
 * focus returns to the row button when the dialog closes.
 */
function ManagerQueue({
  requests,
  loading,
  error,
  onDecided,
}: {
  requests: LeaveRequest[]
  loading: boolean
  error: boolean
  onDecided: () => void
}) {
  const { t } = useI18n()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)

  function open(next: Decision) {
    setNote('')
    setFailure(null)
    setDecision(next)
  }

  function close() {
    setDecision(null)
    setNote('')
    setFailure(null)
  }

  async function decide() {
    if (!decision) {
      return
    }
    if (!decision.approve && note.trim().length === 0) {
      setFailure('queueRejectNoteRequired')
      return
    }
    setBusy(true)
    setFailure(null)
    try {
      if (decision.approve) {
        await leaveApi.approve(decision.request.id, note)
      } else {
        await leaveApi.reject(decision.request.id, note)
      }
      close()
      onDecided()
    } catch (failure) {
      setFailure(leaveErrorKey(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('queueTitle')}</CardTitle>
        <CardDescription>{t('queueSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div data-slot="queue-skeleton" className="flex flex-col gap-3">
            <p role="status" className="sr-only">
              {t('loading')}
            </p>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p className="text-small text-muted-foreground">{t('genericError')}</p>
        ) : requests.length === 0 ? (
          <p className="py-4 text-small text-muted-foreground">{t('queueEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 rounded-panel border border-border p-3 lg:flex-row lg:items-center"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {request.employeeName}
                    <Badge variant="default">{t(leaveTypeKey(request.type))}</Badge>
                  </p>
                  <p className="text-small text-muted-foreground">
                    {formatDate(request.startDate)} – {formatDate(request.endDate)} ·{' '}
                    {request.businessDays} {t('leaveWorkingDays')}
                  </p>
                  {request.reason && (
                    <p className="text-small [overflow-wrap:anywhere]">{request.reason}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:ml-auto">
                  <Button
                    type="button"
                    size="sm"
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      open({ request, approve: true })
                    }}
                  >
                    {t('queueApprove')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      open({ request, approve: false })
                    }}
                  >
                    {t('queueReject')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          closeLabel={t('close')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {decision?.approve ? t('queueApproveTitle') : t('queueRejectTitle')}
            </DialogTitle>
            <DialogDescription>
              {decision?.approve ? t('queueApproveDescription') : t('queueRejectDescription')}
            </DialogDescription>
          </DialogHeader>

          {decision && (
            <div className="flex flex-col gap-1 rounded-panel border border-border bg-muted p-3">
              <p className="font-medium">{decision.request.employeeName}</p>
              <p className="text-small text-muted-foreground">
                {t(leaveTypeKey(decision.request.type))} · {formatDate(decision.request.startDate)}{' '}
                – {formatDate(decision.request.endDate)} · {decision.request.businessDays}{' '}
                {t('leaveWorkingDays')}
              </p>
              {decision.request.reason && (
                <p className="text-small [overflow-wrap:anywhere]">{decision.request.reason}</p>
              )}
            </div>
          )}

          {decision && !decision.approve && (
            <Field
              label={t('queueRejectNote')}
              value={note}
              maxLength={500}
              invalid={failure === 'queueRejectNoteRequired'}
              describedBy={failure ? 'queue-error' : undefined}
              onChange={(event) => {
                setNote(event.target.value)
                setFailure(null)
              }}
              required
            />
          )}

          {failure && (
            <Alert variant="destructive" id="queue-error">
              <p className="font-medium">{t(failure)}</p>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={decision?.approve ? 'default' : 'destructive'}
              disabled={busy}
              onClick={decide}
            >
              {decision?.approve ? t('queueApprove') : t('queueReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export { ManagerQueue }
