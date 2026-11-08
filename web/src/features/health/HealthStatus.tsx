import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'

import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { useHealth } from './useHealth'

export function HealthStatus() {
  const { state, retry } = useHealth()
  const { t } = useI18n()

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          {state === 'loading' && (
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
          )}
          {state === 'up' && <CircleCheck aria-hidden="true" className="size-4 text-success" />}
          {state === 'down' && (
            <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
          )}
          <p className="m-0 text-sm font-medium" role="status" aria-live="polite">
            {state === 'loading' ? t('checking') : t(state)}
          </p>
          {state === 'down' && (
            <Button type="button" variant="secondary" size="sm" onClick={retry} className="ml-auto">
              {t('retry')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
