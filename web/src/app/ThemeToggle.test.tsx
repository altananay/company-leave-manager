import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n/I18nProvider'

import { THEME_STORAGE_KEY, ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

function renderToggle() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    </I18nProvider>,
  )
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('leave-manager.lang', 'tr')
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('shouldOpenAMenuWithTheThreeThemeOptions', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Tema' }))

    expect(await screen.findByRole('menuitemradio', { name: 'Açık' })).toBeVisible()
    expect(screen.getByRole('menuitemradio', { name: 'Koyu' })).toBeVisible()
    expect(screen.getByRole('menuitemradio', { name: 'Sistem' })).toBeVisible()
  })

  it('shouldStoreAndApplyTheChosenTheme', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Tema' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Koyu' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })
})
