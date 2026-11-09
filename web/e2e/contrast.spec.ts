import { expect, test, type Page } from '@playwright/test'

import { goToUsers } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

/**
 * Control boundaries are measured, not trusted (spec 0003, AC-3): axe-core has no rule for WCAG
 * 1.4.11, so the border of a button, a field or a listbox is compared with the surface behind it.
 * A border that is invisible (zero width or `none`) is a failure even when its colour would pass.
 */
async function controlContrast(page: Page, control: string, surface: string) {
  return page.evaluate(
    ([controlSelector, surfaceSelector]) => {
      // getComputedStyle may hand back oklch(); a 1×1 canvas resolves any colour to sRGB.
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')

      const rgb = (value: string) => {
        if (!context) {
          return null
        }
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
        return a === 0 ? null : [r, g, b]
      }
      const luminance = ([r, g, b]: number[]) => {
        const channel = (c: number) => {
          const v = c / 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }

      const controlEl = document.querySelector(controlSelector)
      const surfaceEl = document.querySelector(surfaceSelector)
      if (!controlEl || !surfaceEl) {
        return -1
      }

      const style = getComputedStyle(controlEl)
      // No visible boundary means no contrast to measure.
      if (Number.parseFloat(style.borderTopWidth) === 0 || style.borderTopStyle === 'none') {
        return 0
      }

      const border = rgb(style.borderTopColor)
      const background = rgb(getComputedStyle(surfaceEl).backgroundColor)
      if (!border || !background) {
        return -1
      }
      const [lighter, darker] = [luminance(border), luminance(background)].sort((a, b) => b - a)
      return (lighter + 0.05) / (darker + 0.05)
    },
    [control, surface],
  )
}

test('shouldKeepControlBoundariesAtThreeToOne', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  // The login form sits on the page surface, not in a card.
  expect(await controlContrast(page, 'input', 'body'), 'input border').toBeGreaterThanOrEqual(3)

  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // The home screen has no secondary action any more; the users toolbar's inactive role filters
  // are secondary buttons inside a card, so their boundary is measured where a user meets them.
  await goToUsers(page)
  expect(
    await controlContrast(page, 'button[data-slot="button"].bg-secondary', '[data-slot="card"]'),
    'secondary button border',
  ).toBeGreaterThanOrEqual(3)
})

test('shouldKeepTheRoleListboxReadable', async ({ page }) => {
  // The project emulates reduced motion; its 0.01 ms transition on every property makes a freshly
  // highlighted row report its pre-highlight colour for one frame. This test measures colour, not
  // motion — motion has its own test — so read the settled colours with normal transition timing.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()

  // The role select is named: the form has a second one (the manager) since spec 0004.
  await page.getByRole('combobox', { name: 'Rol' }).click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()

  // The popup boundary against the page behind it.
  expect(
    await controlContrast(page, '[role="listbox"]', '[data-slot="card"]'),
    'listbox border',
  ).toBeGreaterThanOrEqual(3)

  // Radix keeps focus on the trigger and marks the active row with data-highlighted; the indicator
  // has to be visible and reach 3:1 against the row background. Read it in one pass, so the element
  // and its computed style cannot disagree.
  await page.keyboard.press('ArrowDown')

  const indicator = await page.evaluate(() => {
    const option = document.querySelector<HTMLElement>('[role="option"][data-highlighted]')
    if (!option) {
      return null
    }
    const style = getComputedStyle(option)
    return {
      width: Number.parseFloat(style.outlineWidth),
      style: style.outlineStyle,
      color: style.outlineColor,
      background: style.backgroundColor,
    }
  })

  expect(indicator, 'a highlighted row exists').not.toBeNull()
  expect(indicator?.style, 'highlighted row has an outline').not.toBe('none')
  expect(indicator?.width ?? 0, 'highlighted row outline width').toBeGreaterThan(0)

  const ratio = await page.evaluate(
    ({ color, background }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')
      const rgb = (value: string) => {
        if (!context) {
          return null
        }
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
        return a === 0 ? null : [r, g, b]
      }
      const luminance = ([r, g, b]: number[]) => {
        const channel = (c: number) => {
          const v = c / 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const outline = rgb(color)
      const surface = rgb(background)
      if (!outline || !surface) {
        return -1
      }
      const [lighter, darker] = [luminance(outline), luminance(surface)].sort((a, b) => b - a)
      return (lighter + 0.05) / (darker + 0.05)
    },
    { color: indicator?.color ?? '', background: indicator?.background ?? '' },
  )

  expect(ratio, 'highlighted row indicator contrast').toBeGreaterThanOrEqual(3)
})
