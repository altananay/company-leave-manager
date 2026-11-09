import { expect, type Page } from '@playwright/test'

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

export { expectTouchTargets, horizontalOverflow }
