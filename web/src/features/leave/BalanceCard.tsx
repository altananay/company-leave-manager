import { formatDate } from '@/lib/date'
import { useI18n } from '@/i18n/I18nProvider'
import { Alert } from '@/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Skeleton } from '@/ui/skeleton'
import type { Balance } from './leaveApi'

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel border border-border bg-card p-3">
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-h2">{value}</p>
    </div>
  )
}

/**
 * The balance card (AC-3): the current period's entitlement, the carryover, HR adjustments, the
 * annual days approved and pending, and what remains. The two warnings are first-class states, not
 * footnotes: an unknown hire date and a missing manager both change what the employee can do.
 */
function BalanceCard({
  balance,
  loading,
  error,
}: {
  balance: Balance | null
  loading: boolean
  error: boolean
}) {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('balanceTitle')}</CardTitle>
        <CardDescription>{t('balanceSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div data-slot="balance-skeleton" className="flex flex-col gap-3">
            <p role="status" className="sr-only">
              {t('loading')}
            </p>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error || !balance ? (
          <p className="text-small text-muted-foreground">{t('genericError')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label={t('balanceEntitlement')} value={balance.entitlement} />
              <Metric label={t('balanceCarryover')} value={balance.carryover} />
              <Metric label={t('balanceAdjustments')} value={balance.adjustments} />
              <Metric label={t('balanceApproved')} value={balance.approved} />
              <Metric label={t('balancePending')} value={balance.pending} />
              <div className="rounded-panel border border-control bg-accent p-3">
                <p className="text-label uppercase text-accent-foreground">
                  {t('balanceRemaining')}
                </p>
                <p
                  data-slot="balance-remaining"
                  className="mt-1 text-display text-accent-foreground"
                >
                  {balance.remaining}
                </p>
              </div>
            </div>

            {balance.periodStart && (
              <p className="text-small text-muted-foreground">
                {t('balancePeriod')}: {formatDate(balance.periodStart)} –{' '}
                {formatDate(balance.periodEnd)} · {t('balanceSeniority')}: {balance.completedYears}{' '}
                {t('balanceYears')}
              </p>
            )}

            {balance.entitlementDefaulted && (
              <Alert variant="info">
                <p className="text-small">{t('balanceDefaultedWarning')}</p>
              </Alert>
            )}
            {!balance.hasManager && (
              <Alert variant="destructive">
                <p className="text-small">{t('balanceNoManagerWarning')}</p>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { BalanceCard }
