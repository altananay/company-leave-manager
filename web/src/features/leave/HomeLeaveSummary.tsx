import { useEffect, useState } from 'react'

import { formatDate } from '@/lib/date'
import { useI18n } from '@/i18n/I18nProvider'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Skeleton } from '@/ui/skeleton'
import { BalanceCard } from './BalanceCard'
import { leaveStatusKey, leaveStatusVariant, leaveTypeKey } from './format'
import { leaveApi, type Balance, type LeaveRequest } from './leaveApi'

/**
 * The home screen's leave summary (review round 1, L-21): the balance card and the last requests,
 * exactly as the spec's User experience names the home screen. The screen is read-only; a request
 * is opened from the leave screen, which the button below reaches.
 */
function HomeLeaveSummary({ onOpenLeave }: { onOpenLeave: () => void }) {
  const { t } = useI18n()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [balanceStatus, setBalanceStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    leaveApi
      .balance()
      .then((result) => {
        if (!cancelled) {
          setBalance(result)
          setBalanceStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBalanceStatus('error')
        }
      })
    leaveApi
      .requests(1, 3)
      .then((page) => {
        if (!cancelled) {
          setRequests(page.items)
          setListStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BalanceCard
        balance={balance}
        loading={balanceStatus === 'loading'}
        error={balanceStatus === 'error'}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('homeLastRequests')}</CardTitle>
          <CardDescription>{t('homeLastRequestsSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {listStatus === 'loading' ? (
            <div data-slot="home-requests-skeleton" className="flex flex-col gap-3">
              <p role="status" className="sr-only">
                {t('loading')}
              </p>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : listStatus === 'error' ? (
            <p className="text-small text-muted-foreground">{t('homeLastRequestsError')}</p>
          ) : requests.length === 0 ? (
            <p className="text-small text-muted-foreground">{t('homeLastRequestsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center gap-2 rounded-panel border border-border p-3"
                >
                  <span className="text-small">
                    {formatDate(request.startDate)} – {formatDate(request.endDate)}
                  </span>
                  <span className="text-small text-muted-foreground">
                    {t(leaveTypeKey(request.type))} · {request.businessDays} {t('leaveWorkingDays')}
                  </span>
                  <Badge variant={leaveStatusVariant(request.status)} className="ml-auto">
                    {t(leaveStatusKey(request.status))}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="secondary" onClick={onOpenLeave} className="self-start">
            {t('homeOpenLeave')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export { HomeLeaveSummary }
