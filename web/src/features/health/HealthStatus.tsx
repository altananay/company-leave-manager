import { useI18n } from '../../i18n/I18nProvider'
import { useHealth } from './useHealth'

export function HealthStatus() {
  const { state, retry } = useHealth()
  const { t } = useI18n()

  return (
    <div className="status">
      <p className={`status-text status-${state}`} role="status" aria-live="polite">
        {t(state)}
      </p>
      {state === 'down' && (
        <button type="button" onClick={retry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
}
