import { expect, test } from '@playwright/test'

import { controlContrast } from './layout'
import { goToUsers } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

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
  // The /leave employee listbox is the same control on another screen; its boundary and its option
  // sizes are measured once, while it is open, in
  // `leave.spec.ts#shouldKeepTheHrEmployeeListboxMeasurableWhileOpen` (review round 3, N-05).
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
