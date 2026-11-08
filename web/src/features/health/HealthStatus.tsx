import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { useRef } from 'react'

import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { useHealth } from './useHealth'

export function HealthStatus() {
  const { state, retry } = useHealth()
  const { t } = useI18n()
  const statusRef = useRef<HTMLParagraphElement>(null)

  /** The retry button disappears while the check runs; keep the keyboard where the result lands. */
  function retryAndKeepFocus() {
    retry()
    requestAnimationFrame(() => statusRef.current?.focus())
  }

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
          <p
            ref={statusRef}
            tabIndex={-1}
            className="m-0 rounded-chip text-body font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            role="status"
            aria-live="polite"
          >
            {state === 'loading' ? t('checking') : t(state)}
          </p>
          {state === 'down' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={retryAndKeepFocus}
              className="ml-auto"
            >
              {t('retry')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
