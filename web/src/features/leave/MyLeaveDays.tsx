import { useEffect, useState } from 'react'

import { formatDate } from '@/lib/date'
import { useI18n } from '@/i18n/I18nProvider'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Skeleton } from '@/ui/skeleton'
import { halfDayKey, leaveTypeKey } from './format'
import { leaveApi, type LeaveDay } from './leaveApi'

/**
 * "My leave days" (AC-13, D20): the caller's own approved leave days over the server's default
 * window (today … +90 days). A day is read as date + type + half-day in one row, and the state is
 * carried by words, never by colour alone. The card refreshes whenever the page bumps `refreshKey`
 * (a request was created, cancelled or decided).
 */
function MyLeaveDays({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useI18n()
  const [days, setDays] = useState<LeaveDay[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    leaveApi
      .days()
      .then((result) => {
        if (!cancelled) {
          setDays(result)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <Card data-my-leave-days="true">
      <CardHeader>
        <CardTitle>{t('leaveMyDaysTitle')}</CardTitle>
        <CardDescription>{t('leaveMyDaysSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {status === 'loading' ? (
          <div data-slot="my-leave-days-skeleton" className="flex flex-col gap-3">
            <p role="status" className="sr-only">
              {t('loading')}
            </p>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : status === 'error' ? (
          <p className="text-small text-muted-foreground">{t('genericError')}</p>
        ) : days.length === 0 ? (
          <p className="py-4 text-small text-muted-foreground">{t('leaveMyDaysEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {days.map((day) => (
              <li
                key={`${day.requestId}-${day.date}`}
                data-slot="my-leave-day"
                className="flex flex-wrap items-center gap-2 rounded-panel border border-border p-3"
              >
                <time dateTime={day.date} className="text-small font-medium">
                  {formatDate(day.date)}
                </time>
                <Badge variant="muted">{t(leaveTypeKey(day.type))}</Badge>
                {day.halfDay !== 'NONE' && (
                  <span className="text-small text-muted-foreground">
                    {t(halfDayKey(day.halfDay))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export { MyLeaveDays }
