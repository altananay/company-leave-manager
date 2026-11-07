import { HealthStatus } from './features/health/HealthStatus'
import { useI18n } from './i18n/I18nProvider'

function App() {
  const { lang, setLang, t } = useI18n()

  return (
    <main className="shell">
      <header className="shell-header">
        <h1>{t('appTitle')}</h1>
        <div className="lang-switch" role="group" aria-label={t('languageLabel')}>
          <button type="button" aria-pressed={lang === 'tr'} onClick={() => setLang('tr')}>
            TR
          </button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
      </header>
      <HealthStatus />
    </main>
  )
}

export default App
