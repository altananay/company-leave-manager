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
import {
  formatDays,
  isOneDayType,
  kinshipKey,
  leaveErrorKey,
  leaveTypeHints,
  leaveTypeKey,
} from './format'
import {
  leaveApi,
  type HalfDay,
  type Kinship,
  type LeaveRequest,
  type LeaveType,
  type Preview,
} from './leaveApi'

/** The type selector is a flat list (B2 plan risk note): no grouping primitive is introduced. */
const LEAVE_TYPES: readonly LeaveType[] = [
  'ANNUAL',
  'EXCUSE',
  'MARRIAGE',
  'BEREAVEMENT',
  'SPOUSE_BIRTH',
  'SCHOOL_REPORT',
  'BIRTHDAY',
  'FIRST_SCHOOL_DAY',
]

const KINSHIPS: readonly Kinship[] = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING']

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
  const { t, lang } = useI18n()
  const [type, setType] = useState<LeaveType>('ANNUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDay, setHalfDay] = useState<HalfDay>('NONE')
  const [kinship, setKinship] = useState<Kinship | ''>('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  // D19: the three one-day types have no end date of their own; it is the start date.
  const oneDay = isOneDayType(type)
  const end = oneDay ? startDate : endDate
  // D17/D19: the kinship belongs to a bereavement request and to nothing else.
  const kinshipRequired = type === 'BEREAVEMENT'

  // D15: a half day is one day long, and only annual/excuse leave knows the concept at all. On a
  // range (or before both dates are chosen) the control is absent and the request carries NONE.
  const halfDayAvailable =
    (type === 'ANNUAL' || type === 'EXCUSE') && startDate !== '' && startDate === end
  const effectiveHalfDay: HalfDay = halfDayAvailable ? halfDay : 'NONE'

  useEffect(() => {
    if (!open || !startDate || !end) {
      return
    }
    let cancelled = false
    leaveApi
      .preview(startDate, end, type, effectiveHalfDay)
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
  }, [open, startDate, end, type, effectiveHalfDay])

  function close() {
    setStartDate('')
    setEndDate('')
    setHalfDay('NONE')
    setKinship('')
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
      const created = await leaveApi.create(
        type,
        startDate,
        end,
        effectiveHalfDay,
        reason,
        kinshipRequired ? kinship || null : null,
      )
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
  // L-02: phase A's EXCUSE is bounded and always carries its reason; the server enforces both, and
  // the form says so before sending. Annual leave keeps its optional reason.
  const reasonRequired = type === 'EXCUSE'

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
                const next = value as LeaveType
                setType(next)
                setPreview(null)
                setError(null)
                if (next !== 'BEREAVEMENT') {
                  setKinship('')
                }
                // A one-day type has no end of its own; a stale range must not survive the switch.
                if (isOneDayType(next)) {
                  setEndDate('')
                }
              }}
            >
              <SelectTrigger id="leave-type-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(leaveTypeKey(option))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-0.5 text-small text-muted-foreground">
              {leaveTypeHints(type).map((hint) => (
                <p key={hint}>{t(hint)}</p>
              ))}
            </div>
          </div>

          <div className={oneDay ? 'flex flex-col gap-4' : 'grid gap-4 sm:grid-cols-2'}>
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
                // A half day belongs to one day; a range resets the choice (the control disappears).
                if (event.target.value !== end) {
                  setHalfDay('NONE')
                }
              }}
              required
            />
            {!oneDay && (
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
                  if (event.target.value !== startDate) {
                    setHalfDay('NONE')
                  }
                }}
                required
              />
            )}
          </div>

          {kinshipRequired && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-kinship-trigger">{t('kinship')}</Label>
              <Select
                value={kinship}
                onValueChange={(value) => {
                  setKinship(value as Kinship)
                  setError(null)
                }}
              >
                <SelectTrigger
                  id="leave-kinship-trigger"
                  aria-invalid={error === 'leaveKinshipRequired' || undefined}
                  aria-describedby={error ? 'leave-form-error' : undefined}
                >
                  <SelectValue placeholder={t('kinshipPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {KINSHIPS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(kinshipKey(option))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {halfDayAvailable && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-half-day-trigger">{t('leaveHalfDay')}</Label>
              <Select
                value={halfDay}
                onValueChange={(value) => {
                  setHalfDay(value as HalfDay)
                  setPreview(null)
                }}
              >
                <SelectTrigger id="leave-half-day-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t('halfDayNone')}</SelectItem>
                  <SelectItem value="AM">{t('halfDayAm')}</SelectItem>
                  <SelectItem value="PM">{t('halfDayPm')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Field
            label={t('leaveReason')}
            value={reason}
            placeholder={t(
              reasonRequired ? 'leaveReasonExcusePlaceholder' : 'leaveReasonPlaceholder',
            )}
            maxLength={500}
            invalid={error === 'leaveReasonRequired'}
            describedBy={error ? 'leave-form-error' : undefined}
            required={reasonRequired}
            onChange={(event) => {
              setReason(event.target.value)
              setError(null)
            }}
          />

          {preview && (
            <div className="rounded-panel border border-border bg-muted px-4 py-3">
              <p className="text-small">
                {formatDays(preview.businessDays, lang)} {t('leaveWorkingDays')} ·{' '}
                {t('leaveRemainingAfter')}: {formatDays(preview.remainingAfter, lang)}{' '}
                {t('leaveDaysUnit')}
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
            <Button
              type="submit"
              disabled={
                busy ||
                !startDate ||
                (!oneDay && !endDate) ||
                (reasonRequired && reason.trim().length === 0) ||
                (kinshipRequired && kinship === '')
              }
            >
              {busy ? t('leaveSending') : t('leaveSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { LeaveRequestForm }
