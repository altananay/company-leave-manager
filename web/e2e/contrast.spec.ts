import { expect, test, type Page } from '@playwright/test'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

/**
 * Control boundaries are measured, not trusted (spec 0003, AC-3): axe-core has no rule for WCAG
 * 1.4.11, so the border of a button or a field is compared with the surface behind it here.
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
      const border = rgb(getComputedStyle(controlEl).borderTopColor)
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

  // Field boundary against the card it sits on.
  expect(
    await controlContrast(page, 'input', '[data-slot="card"]'),
    'input border',
  ).toBeGreaterThanOrEqual(3)

  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // Secondary button boundary against the card.
  expect(
    await controlContrast(page, 'button[data-slot="button"].bg-secondary', '[data-slot="card"]'),
    'secondary button border',
  ).toBeGreaterThanOrEqual(3)
})
