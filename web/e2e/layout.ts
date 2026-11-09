import { expect, type Page } from '@playwright/test'

/**
 * The shared e2e measurements: what a thumb has to hit, how wide the layout really is, and how much
 * contrast a control boundary has. They live in one module so a spec measures the same thing the
 * same way instead of carrying its own copy of the arithmetic.
 */

/**
 * Every control a thumb has to hit: buttons, fields, the combobox, listbox options and menu items
 * (spec 0003 AC-8, reused by spec 0004 AC-10).
 */
async function expectTouchTargets(
  page: Page,
  label: string,
  selector = 'button:visible, input:visible, [role="combobox"]:visible, [role="menuitem"]:visible',
) {
  const controls = page.locator(selector)
  const count = await controls.count()
  expect(count, `${label} has controls`).toBeGreaterThan(0)

  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox()
    expect(box?.height ?? 0, `${label} control ${index} height`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `${label} control ${index} width`).toBeGreaterThanOrEqual(44)
  }
}

/**
 * The horizontal overflow a user can actually reach (spec 0003 AC-4). On shell screens the root is
 * `overflow-hidden`, so `document.documentElement` is structurally clean and the content region
 * (`<main id="content">`, which scrolls on both axes) is the box that can overflow. Anonymous
 * screens have no `#content` and scroll on the document. Measure both and report the larger one, so
 * a regression on either layout fails.
 */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const documentOverflow =
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    const content = document.querySelector<HTMLElement>('main#content')
    const contentOverflow = content ? content.scrollWidth - content.clientWidth : 0
    return Math.max(documentOverflow, contentOverflow)
  })
}

/**
 * Control boundaries are measured, not trusted (spec 0003, AC-3; spec 0004 review round 3, N-05):
 * axe-core has no rule for WCAG 1.4.11, so the border of a button, a field or a listbox is compared
 * with the surface behind it. A border that is invisible (zero width or `none`) is a failure even
 * when its colour would pass.
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

export { controlContrast, expectTouchTargets, horizontalOverflow }
