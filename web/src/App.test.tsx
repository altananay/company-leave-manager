import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { I18nProvider, detectInitialLang } from './i18n/I18nProvider'

const STORAGE_KEY = 'leave-manager.lang'

function healthResponse(status: 'UP' | 'DOWN', httpStatus = 200) {
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    json: async () => ({ status }),
  } as Response
}

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}

function setBrowserLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  setBrowserLanguage('tr-TR')
  document.documentElement.lang = 'tr'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('health status', () => {
  it('shouldShowLoadingThenSuccess', async () => {
    let resolveFetch!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending),
    )

    renderApp()

    expect(screen.getByText('Kontrol ediliyor…')).toBeInTheDocument()

    resolveFetch(healthResponse('UP'))

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
  })

  it('shouldShowErrorAndRetry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(healthResponse('UP'))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }))

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shouldShowErrorOn503Down', async () => {
    // The contract's failure path: 503 with {"status":"DOWN"} (not a network error).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(healthResponse('DOWN', 503))
      .mockResolvedValueOnce(healthResponse('UP'))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Bağlantı hatası')).toBeInTheDocument()

    // AC-8 covers the error state too: the language control translates the message and its retry button.
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Connection error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('System is up')).toBeInTheDocument()
  })
})

describe('detectInitialLang', () => {
  it('shouldPreferTheStoredLanguageOverTheBrowser', () => {
    expect(detectInitialLang('en', 'tr-TR')).toBe('en')
    expect(detectInitialLang('tr', 'en-US')).toBe('tr')
  })

  it('shouldUseTheBrowserLanguageWhenNothingIsStored', () => {
    expect(detectInitialLang(null, 'en-GB')).toBe('en')
    expect(detectInitialLang(null, 'tr-TR')).toBe('tr')
  })

  it('shouldFallBackToTurkishForAnyOtherLanguage', () => {
    expect(detectInitialLang(null, 'de-DE')).toBe('tr')
    expect(detectInitialLang(null, '')).toBe('tr')
  })
})

describe('language', () => {
  it('shouldUseBrowserLanguageAsDefault', async () => {
    setBrowserLanguage('en-US')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(healthResponse('UP'))),
    )

    renderApp()

    expect(screen.getByRole('heading', { name: 'Leave Management' })).toBeInTheDocument()
    expect(await screen.findByText('System is up')).toBeInTheDocument()
    expect(document.title).toBe('Leave Management')
  })

  it('shouldFallBackToTurkishForOtherBrowserLanguages', async () => {
    setBrowserLanguage('de-DE')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(healthResponse('UP'))),
    )

    renderApp()

    expect(screen.getByRole('heading', { name: 'İzin Yönetimi' })).toBeInTheDocument()
    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()
  })

  it('shouldUseTheStoredLanguageOnReload', async () => {
    // A reload: the language was chosen earlier and is read back from localStorage.
    localStorage.setItem(STORAGE_KEY, 'en')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(healthResponse('UP'))),
    )

    renderApp()

    expect(screen.getByRole('heading', { name: 'Leave Management' })).toBeInTheDocument()
    expect(await screen.findByText('System is up')).toBeInTheDocument()
  })

  it('shouldSwitchLanguageAndPersist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(healthResponse('UP'))),
    )

    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Sistem çalışıyor')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('heading', { name: 'Leave Management' })).toBeInTheDocument()
    expect(screen.getByText('System is up')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Leave Management')
  })
})
