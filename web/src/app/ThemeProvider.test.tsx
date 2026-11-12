import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectInitialTheme, THEME_STORAGE_KEY, ThemeProvider, useTheme } from './ThemeProvider'

type Listener = (event: MediaQueryListEvent) => void

/** A controllable `prefers-color-scheme` media query; the setup's stub is inert. */
function installMatchMedia(dark: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_event: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_event: string, listener: Listener) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  vi.stubGlobal('matchMedia', () => media)
  return { listeners, media }
}

function Probe() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('shouldTreatAnUnknownStoredThemeAsSystem', () => {
    expect(detectInitialTheme(null)).toBe('system')
    expect(detectInitialTheme('sepia')).toBe('system')
    expect(detectInitialTheme('light')).toBe('light')
    expect(detectInitialTheme('dark')).toBe('dark')
  })

  it('shouldApplyAStoredDarkThemeOnMount', () => {
    installMatchMedia(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('shouldFollowTheSystemPreferenceAndItsChanges', () => {
    const { listeners, media } = installMatchMedia(true)

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')

    act(() => {
      media.matches = false
      listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent))
    })

    expect(screen.getByTestId('resolved')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('shouldPersistAnExplicitChoice', () => {
    installMatchMedia(false)

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')

    fireEvent.click(screen.getByRole('button', { name: 'light' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('shouldSurviveBlockedStorage', () => {
    installMatchMedia(false)
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    // An unreadable choice means system; a failed write keeps the choice in memory.
    expect(screen.getByTestId('theme')).toHaveTextContent('system')

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')

    getItem.mockRestore()
    setItem.mockRestore()
  })
})
