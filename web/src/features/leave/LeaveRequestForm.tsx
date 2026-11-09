import { useEffect, useState, type FormEvent, type RefObject } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
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
import { leaveErrorKey } from './format'
import { leaveApi, type LeaveRequest, type LeaveType, type Preview } from './leaveApi'

/**
 * The request dialog (AC-1): type, date range and reason, with the working-day summary shown before
 * the request is sent. The summary comes from the server — the SPA does not own the business
 * calendar (docs/architecture.md: the server is the only source of truth).
 */
function LeaveRequestForm({
  open,
  onOpenChange,
  onCreated,
  returnFocusTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (request: LeaveRequest) => void
  returnFocusTo: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const [type, setType] = useState<LeaveType>('ANNUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !startDate || !endDate) {
      return
    }
    let cancelled = false
    leaveApi
      .preview(startDate, endDate, type)
      .then((result) => {
        if (!cancelled) {
          setPreview(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, startDate, endDate, type])

  function close() {
    setStartDate('')
    setEndDate('')
    setReason('')
    setPreview(null)
    setError(null)
    onOpenChange(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const created = await leaveApi.create(type, startDate, endDate, reason)
      setType('ANNUAL')
      close()
      onCreated(created)
    } catch (failure) {
      setError(leaveErrorKey(failure))
    } finally {
      setBusy(false)
    }
  }

  const dateInvalid = error === 'leavePastDate' || error === 'leaveInvalidRange'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent
        closeLabel={t('close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('leaveFormTitle')}</DialogTitle>
          <DialogDescription>{t('leaveFormDescription')}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-type-trigger">{t('leaveType')}</Label>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value as LeaveType)
                setPreview(null)
              }}
            >
              <SelectTrigger id="leave-type-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANNUAL">{t('leaveTypeAnnual')}</SelectItem>
                <SelectItem value="EXCUSE">{t('leaveTypeExcuse')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('leaveStartDate')}
              type="date"
              value={startDate}
              invalid={dateInvalid}
              describedBy={error ? 'leave-form-error' : undefined}
              onChange={(event) => {
                setStartDate(event.target.value)
                setPreview(null)
                setError(null)
              }}
              required
            />
            <Field
              label={t('leaveEndDate')}
              type="date"
              value={endDate}
              invalid={dateInvalid}
              describedBy={error ? 'leave-form-error' : undefined}
              onChange={(event) => {
                setEndDate(event.target.value)
                setPreview(null)
                setError(null)
              }}
              required
            />
          </div>

          <Field
            label={t('leaveReason')}
            value={reason}
            placeholder={t('leaveReasonPlaceholder')}
            maxLength={500}
            describedBy={error ? 'leave-form-error' : undefined}
            onChange={(event) => setReason(event.target.value)}
          />

          {preview && (
            <div className="rounded-panel border border-border bg-muted px-4 py-3">
              <p className="text-small">
                {preview.businessDays} {t('leaveWorkingDays')} · {t('leaveRemainingAfter')}:{' '}
                {preview.remainingAfter} {t('leaveDaysUnit')}
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive" id="leave-form-error">
              <p className="font-medium">{t(error)}</p>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !startDate || !endDate}>
              {busy ? t('leaveSending') : t('leaveSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { LeaveRequestForm }
