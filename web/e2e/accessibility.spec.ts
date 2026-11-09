import AxeBuilder from '@axe-core/playwright'
import type { NodeResult, Result } from 'axe-core'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { goToLeave, goToUsers, openUsers } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

/** One rule as this file reports it: the id and how many nodes it points at. */
function describeRule(rule: Result) {
  return `${rule.id}: ${rule.nodes.length} node(s)`
}

/** axe's manual question about `aria-controls` on an expanded `aria-haspopup` trigger. */
const POPUP_CONTROLS_REVIEW = 'controlsWithinPopup'

/** Whether axe left this node for review purely because the trigger is a popup. */
function isPopupControlsReview(node: NodeResult) {
  return [...node.any, ...node.all, ...node.none].some(
    (check) => check.data?.messageKey === POPUP_CONTROLS_REVIEW,
  )
}

/** Whether axe could not measure this text because it sits on a CSS gradient. */
function isGradientContrastReview(node: NodeResult) {
  return [...node.any, ...node.all, ...node.none].some(
    (check) => check.id === 'color-contrast' && check.data?.messageKey === 'bgGradient',
  )
}

/** Whether axe skipped this node because it holds only a non-text glyph (the panel's `✓` chips). */
function isNonTextContrastReview(node: NodeResult) {
  return [...node.any, ...node.all, ...node.none].some(
    (check) => check.id === 'color-contrast' && check.data?.messageKey === 'nonBmp',
  )
}

/**
 * The manual half of `aria-valid-attr-value`: the trigger is expanded and the id in its
 * `aria-controls` really names the popup it promises, which axe cannot confirm while a popup is
 * open (the content is rendered later, in a portal).
 */
async function expectPopupControlsToResolve(page: Page, nodes: NodeResult[]) {
  const references = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const trigger = document.querySelector<HTMLElement>(selector)
        const controls = trigger?.getAttribute('aria-controls') ?? null
        const popup = controls ? document.getElementById(controls) : null
        return {
          selector,
          expanded: trigger?.getAttribute('aria-expanded') ?? null,
          popup: trigger?.getAttribute('aria-haspopup') ?? null,
          controls,
          popupRole: popup?.getAttribute('role') ?? null,
        }
      }),
    nodes.map((node) => String(node.target[0])),
  )

  for (const reference of references) {
    expect(reference.expanded, `${reference.selector} is expanded`).toBe('true')
    expect(reference.popup, `${reference.selector} declares a popup`).not.toBeNull()
    expect(reference.controls, `${reference.selector} names the popup it controls`).not.toBeNull()
    expect(
      reference.popupRole,
      `${reference.selector} aria-controls resolves to the ${reference.popup} it declares`,
    ).toBe(reference.popup)
  }
}

/** Whether every node axe names is on the page and outside the open dialog. */
async function allNodesOutsideDialog(page: Page, nodes: NodeResult[]) {
  const results = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector)
        return element === null || element.closest('[role="dialog"]') !== null
      }),
    nodes.map((node) => String(node.target[0])),
  )
  return !results.includes(true)
}

/**
 * `color-contrast` may stay `incomplete` only on the surfaces this suite measures elsewhere:
 * the brand panel (`shouldKeepTheBrandPanelTextReadable`) and every `brand-action` element — the
 * primary buttons and the İY brand mark (`shouldKeepThePrimaryButtonTextReadable`). The `✓` chips
 * are deliberately not text (`nonBmp`), and they are allowed only inside the brand panel. A gradient
 * node anywhere else is still a gap and fails here, which is exactly what the previous blanket
 * `color-contrast` exception hid.
 */
async function expectGradientContrastNodesToBeMeasured(
  page: Page,
  label: string,
  nodes: NodeResult[],
) {
  const surfaces = await page.evaluate(
    (targets) =>
      targets.map(({ selector, glyph }) => {
        const element = document.querySelector(selector)
        if (!element) {
          return { selector, surface: 'missing' }
        }
        if (glyph) {
          return {
            selector,
            surface: element.closest('[data-slot="brand-panel"]') ? 'brand-panel-glyph' : 'unknown',
          }
        }
        if (element.closest('[data-slot="brand-panel"]')) {
          return { selector, surface: 'brand-panel' }
        }
        if (element.closest('.brand-action')) {
          return { selector, surface: 'brand-action' }
        }
        return { selector, surface: 'unknown' }
      }),
    nodes.map((node) => ({
      selector: String(node.target[0]),
      glyph: isNonTextContrastReview(node),
    })),
  )

  expect(
    surfaces.filter((surface) => surface.surface === 'unknown' || surface.surface === 'missing'),
    `${label} has color-contrast gaps outside the measured gradient surfaces`,
  ).toEqual([])
}

/**
 * The manual half of `aria-hidden-focus`: with a modal dialog open, axe can only ask whether the
 * focus trap keeps the elements Radix hid out of the tab order. Pressing the key answers it: one
 * round more than the dialog's focusable elements, both directions, must never leave the dialog.
 */
async function expectFocusTrappedInDialog(page: Page, label: string) {
  const dialogControls = page.locator(
    '[role="dialog"] button:visible, [role="dialog"] a[href]:visible, ' +
      '[role="dialog"] input:visible, [role="dialog"] select:visible, ' +
      '[role="dialog"] textarea:visible, [role="dialog"] [tabindex]:not([tabindex="-1"]):visible',
  )
  const presses = (await dialogControls.count()) + 1

  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 1; press <= presses; press++) {
      await page.keyboard.press(key)
      const escaped = await page.evaluate(() => {
        const active = document.activeElement
        if (!(active instanceof HTMLElement) || active === document.body) {
          return 'focus left the document'
        }
        return active.closest('[role="dialog"]')
          ? null
          : `<${active.tagName.toLowerCase()}> ${active.outerHTML.slice(0, 80)}`
      })
      expect(escaped, `${label}: ${key} ${press} keeps focus inside the open dialog`).toBeNull()
    }
  }
}

/**
 * The real accessibility measurement: a real browser, real CSS, real contrast.
 * jest-axe runs in jsdom, where colour rules are switched off and no stylesheet is loaded, so this
 * test is the one that can actually fail on a contrast regression (spec 0003, AC-3).
 *
 * <p>{@code include} narrows the scan to a surface that overlaps the page (an open menu): axe marks
 * the partially covered text behind it "incomplete", which is a measurement gap, not a defect. The
 * page itself is measured before such a surface opens.
 */
async function expectNoViolations(page: Page, label: string, include?: string | string[]) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  for (const selector of include === undefined ? [] : [include].flat()) {
    builder.include(selector)
  }
  const results = await builder.analyze()

  expect(results.violations.map(describeRule), `${label} has accessibility violations`).toEqual([])

  // Nothing may be left unmeasured. axe answers `incomplete` when the DOM alone cannot decide, so
  // the manual questions it asks are measured here instead — and only those:
  //
  // - `color-contrast` (`bgGradient`): a background image is not a colour axe can resolve. Only
  //   the measured gradient surfaces may stay incomplete: `[data-slot="brand-panel"]`,
  //   `shouldKeepTheBrandPanelTextReadable`, and `.brand-action` (the primary buttons and the İY
  //   brand mark), `shouldKeepThePrimaryButtonTextReadable`.
  //   `nonBmp` on the panel's `✓` chips is allowed too: the node holds a non-text glyph, so there
  //   is no text contrast to measure. `expectGradientContrastNodesToBeMeasured` proves each
  //   incomplete node sits on one of those surfaces; any other gradient node fails below.
  // - `aria-hidden-focus` while a modal dialog is open: `focusable-modal-open` asks whether the
  //   focus trap keeps the hidden nodes out of the tab order. The nodes are Radix's two focus
  //   guards (focusable and hidden by design) and the shell Radix hides behind the dialog;
  //   `expectFocusTrappedInDialog` presses Tab and Shift+Tab to prove they stay unreachable. The
  //   exception only covers nodes *outside* the dialog — a focusable element inside an open dialog
  //   must never be `aria-hidden` — and without an open dialog the rule must be clean: that is the
  //   account-menu bug this suite caught.
  // - `aria-valid-attr-value` (`controlsWithinPopup`) on an expanded `aria-haspopup` trigger:
  //   `expectPopupControlsToResolve` resolves the id instead of reviewing it.
  //
  // Every other incomplete rule is still a gap and fails here.
  const dialogOpen = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return dialog !== null && dialog.getClientRects().length > 0
  })

  const unmeasured: Result[] = []
  for (const rule of results.incomplete) {
    if (
      rule.id === 'color-contrast' &&
      rule.nodes.every((node) => isGradientContrastReview(node) || isNonTextContrastReview(node))
    ) {
      await expectGradientContrastNodesToBeMeasured(page, label, rule.nodes)
      continue
    }
    if (rule.id === 'aria-valid-attr-value' && rule.nodes.every(isPopupControlsReview)) {
      await expectPopupControlsToResolve(page, rule.nodes)
      continue
    }
    if (
      rule.id === 'aria-hidden-focus' &&
      dialogOpen &&
      (await allNodesOutsideDialog(page, rule.nodes))
    ) {
      await expectFocusTrappedInDialog(page, label)
      continue
    }
    unmeasured.push(rule)
  }

  expect(unmeasured.map(describeRule), `${label} has incomplete accessibility checks`).toEqual([])
}

/**
 * The sign-in panel sits on a CSS gradient, where axe can only answer `incomplete` for text
 * contrast: a background image is not a colour it can resolve. This measures the panel's text the
 * way `contrast.spec.ts` measures control boundaries — a canvas turns every computed colour into
 * sRGB — against every gradient stop, which is the conservative bound (any point on the gradient
 * lies between its stops). The lowest ratio wins.
 */
async function lowestBrandPanelContrast(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-slot="brand-panel"]')
    if (!panel) {
      return -1
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) {
      return -1
    }

    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (a: number, b: number) => {
      const [lighter, darker] = [a, b].sort((left, right) => right - left)
      return (lighter + 0.05) / (darker + 0.05)
    }

    const stops = Array.from(
      getComputedStyle(panel).backgroundImage.matchAll(/oklch\([^)]+\)/g),
      (match) => rgba(match[0]),
    )
    if (stops.length === 0) {
      return -1
    }

    // Leaf text elements plus the list items, whose colour is inherited by their text node; the
    // check-mark chips are skipped (their own translucent background is not the gradient). The
    // monogram is a two-character leaf, so the length filter must not skip it.
    const textElements = [
      ...Array.from(panel.querySelectorAll<HTMLElement>('li')),
      ...Array.from(panel.querySelectorAll<HTMLElement>('h2, p, span')).filter(
        (element) =>
          element.children.length === 0 &&
          (element.textContent ?? '').trim().length > 0 &&
          !(element.textContent ?? '').includes('✓'),
      ),
    ]

    const ratios = textElements.flatMap((element) => {
      const text = rgba(getComputedStyle(element).color)
      return stops.map((stop) => {
        const blended = {
          r: text.r * text.a + stop.r * (1 - text.a),
          g: text.g * text.a + stop.g * (1 - text.a),
          b: text.b * text.a + stop.b * (1 - text.a),
        }
        return ratio(luminance(blended), luminance(stop))
      })
    })

    return ratios.length === 0 ? -1 : Math.min(...ratios)
  })
}

/**
 * The primary action's surface is `brand-action`, a CSS gradient shared by the `Button` primary
 * variant and the İY monogram. axe can only answer `incomplete` for text on it, so this measures
 * every visible `brand-action` with text against every gradient stop — the conservative bound,
 * because any point on a gradient lies between its stops. White text on the darker stop is not the
 * worst case; measuring all stops is. The lowest ratio wins.
 */
async function lowestBrandActionContrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) {
      return -1
    }

    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (a: number, b: number) => {
      const [lighter, darker] = [a, b].sort((left, right) => right - left)
      return (lighter + 0.05) / (darker + 0.05)
    }

    const actions = Array.from(document.querySelectorAll<HTMLElement>('.brand-action')).filter(
      (element) =>
        element.getClientRects().length > 0 && (element.textContent ?? '').trim().length > 0,
    )

    const ratios = actions.flatMap((element) => {
      const style = getComputedStyle(element)
      const stops = Array.from(style.backgroundImage.matchAll(/oklch\([^)]+\)/g), (match) =>
        rgba(match[0]),
      )
      if (stops.length === 0) {
        return []
      }
      const text = rgba(style.color)
      return stops.map((stop) => {
        const blended = {
          r: text.r * text.a + stop.r * (1 - text.a),
          g: text.g * text.a + stop.g * (1 - text.a),
          b: text.b * text.a + stop.b * (1 - text.a),
        }
        return ratio(luminance(blended), luminance(stop))
      })
    })

    return ratios.length === 0 ? -1 : Math.min(...ratios)
  })
}

test('shouldHaveNoAccessibilityViolationsOnEveryScreen', async ({ page }) => {
  // Login
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expectNoViolations(page, 'login')

  // Login with an error
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill('wrong-password')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('E-posta veya parola hatalı.')).toBeVisible()
  await expectNoViolations(page, 'login with an error')

  // Home
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expectNoViolations(page, 'home')

  // The account menu is a new surface (A-5): scan it while it is open.
  await page.locator('header button[aria-haspopup="menu"]').click()
  await expect(page.getByRole('menuitem', { name: 'Çıkış' })).toBeVisible()
  await expectNoViolations(page, 'account menu')
  await page.keyboard.press('Escape')

  // One manageable account, so the row actions and their dialog are really on screen.
  await page.evaluate(async () => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({
        email: `scan-${Date.now()}@acme.test`,
        displayName: 'Scan Person',
        role: 'EMPLOYEE',
      }),
    })
  })

  // Users, then the confirmation dialog on top of it
  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  // The heading renders before the request answers: scan the list, not the loading state.
  await expect(page.getByRole('table')).toBeVisible()
  await expectNoViolations(page, 'users')

  await page.getByRole('button', { name: 'İşlemler' }).first().click()
  await expect(page.getByRole('menuitem', { name: 'Pasife al' })).toBeVisible()
  // The open menu covers part of the form behind it, so axe cannot measure that text: scan the
  // menu and its trigger, which is the surface this step exists for.
  await expectNoViolations(page, 'row actions menu', [
    '[role="menu"]',
    'button[aria-haspopup="menu"][aria-expanded="true"]',
  ])
  await page.getByRole('menuitem', { name: 'Pasife al' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // A modal dims the page behind it, so axe can no longer decide the contrast of the text it
  // covers: measure the dialog itself, and prove the focus trap the modal promises separately.
  await expectNoViolations(page, 'deactivation dialog', '[role="dialog"]')
  await expectFocusTrappedInDialog(page, 'deactivation dialog')
  await page.keyboard.press('Escape')
})

test('shouldHaveNoAccessibilityViolationsOnThePasswordAndForbiddenScreens', async ({ page }) => {
  // Sign in as HR and create a newcomer through the page's own session (the request fixture has a
  // separate cookie jar, so it would answer 401).
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  const created = await page.evaluate(async () => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({
        email: `a11y-${Date.now()}@acme.test`,
        displayName: 'A11y Person',
        role: 'EMPLOYEE',
      }),
    })
    return response.json()
  })

  const employee = await page.context().browser()!.newContext()
  const employeePage = await employee.newPage()
  await employeePage.goto('/')
  await employeePage.getByLabel('E-posta').fill(created.user.email)
  await employeePage.getByLabel('Parola').fill(created.temporaryPassword)
  await employeePage.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(employeePage.getByRole('heading', { name: 'Parola değiştirme' })).toBeVisible()
  await expectNoViolations(employeePage, 'password change')

  await employeePage.getByLabel('Mevcut parola').fill(created.temporaryPassword)
  await employeePage.getByLabel('Yeni parola', { exact: true }).fill('brand-new-pass-123')
  await employeePage.getByLabel('Yeni parola (tekrar)').fill('brand-new-pass-123')
  await employeePage.getByRole('button', { name: 'Parolayı değiştir' }).click()
  await expect(employeePage.getByText('Giriş yapan:')).toBeVisible()

  // The employee reaches the users route, but the API answers 403: the forbidden screen is the
  // expected outcome, so do not wait for the list heading.
  await openUsers(employeePage)
  // The 403 view is the users route's outcome, so "Kullanıcılar" is the current crumb there too —
  // the breadcrumb and the sidebar agree, and the heading carries the screen's own claim.
  const crumbs = employeePage.getByRole('navigation', { name: 'Sayfa yolu' })
  await expect(
    employeePage.getByRole('heading', { name: 'Bu sayfaya erişiminiz yok' }),
  ).toBeVisible()
  await expect(crumbs.getByText('Kullanıcılar')).toHaveAttribute('aria-current', 'page')
  await expect(crumbs.getByText('Ana ekran')).not.toHaveAttribute('aria-current', 'page')
  await expectNoViolations(employeePage, 'forbidden')

  await employee.close()
})

test('shouldHaveNoAccessibilityViolationsOnTheMobileShell', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // The open navigation sheet is a screen in its own right on a phone.
  await page.getByRole('button', { name: 'Menü' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoViolations(page, 'navigation sheet at 360 px')
  await page.keyboard.press('Escape')

  // One manageable row, so the row menu really exists at this width.
  await page.evaluate(async () => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({
        email: `mobile-${Date.now()}@acme.test`,
        displayName: 'Mobile Person',
        role: 'EMPLOYEE',
      }),
    })
  })

  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expectNoViolations(page, 'users at 360 px')

  await page.getByRole('button', { name: 'İşlemler' }).first().click()
  await expect(page.getByRole('menuitem', { name: 'Pasife al' })).toBeVisible()
  await expectNoViolations(page, 'row actions menu at 360 px')
})

test('shouldHaveNoAccessibilityViolationsOnTheLeaveScreen', async ({ page }) => {
  // HR sees the balance card, the adjustment form and the empty list (AC-6, AC-10).
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  await goToLeave(page)
  await expect(page.getByRole('heading', { name: 'İzin talepleri' })).toBeVisible()
  await expect(page.locator('[data-slot="balance-remaining"]')).toHaveText(/\d+/)
  await expectNoViolations(page, 'leave screen')

  // An employee with a manager can open the request dialog; it is the tightest form in the slice.
  const stamp = Date.now()
  const created = await page.evaluate(async (suffix) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const post = (body: unknown) =>
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify(body),
      }).then((response) => response.json())
    const manager = await post({
      email: `scan-lead-${suffix}@acme.test`,
      displayName: `Scan Lead ${suffix}`,
      role: 'MANAGER',
    })
    const employee = await post({
      email: `scan-leave-${suffix}@acme.test`,
      displayName: `Scan Leave ${suffix}`,
      role: 'EMPLOYEE',
      managerId: manager.user.id,
      hireDate: '2024-01-15',
    })
    return { email: employee.user.email, password: employee.temporaryPassword }
  }, stamp)

  const employeeContext = await page.context().browser()!.newContext()
  const employeePage = await employeeContext.newPage()
  await employeePage.goto('/')
  await employeePage.getByLabel('E-posta').fill(created.email)
  await employeePage.getByLabel('Parola').fill(created.password)
  await employeePage.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(employeePage.getByRole('heading', { name: 'Parola değiştirme' })).toBeVisible()
  await employeePage.getByLabel('Mevcut parola').fill(created.password)
  await employeePage.getByLabel('Yeni parola', { exact: true }).fill('leave-scan-password-123')
  await employeePage.getByLabel('Yeni parola (tekrar)').fill('leave-scan-password-123')
  await employeePage.getByRole('button', { name: 'Parolayı değiştir' }).click()
  await expect(employeePage.getByText('Giriş yapan:')).toBeVisible()

  await employeePage.setViewportSize({ width: 360, height: 900 })
  await goToLeave(employeePage)
  await expect(employeePage.locator('[data-slot="balance-remaining"]')).toHaveText(/\d+/)
  await expectNoViolations(employeePage, 'leave screen at 360 px')

  await employeePage.getByRole('button', { name: 'Yeni talep' }).click()
  await expect(employeePage.getByRole('dialog')).toBeVisible()
  await expectNoViolations(employeePage, 'leave request dialog', '[role="dialog"]')
  await expectFocusTrappedInDialog(employeePage, 'leave request dialog')

  await employeeContext.close()
})

test('shouldKeepTheBrandPanelTextReadable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('[data-slot="brand-panel"]')).toBeVisible()

  expect(
    await lowestBrandPanelContrast(page),
    'brand-panel text against the gradient (4.5:1)',
  ).toBeGreaterThanOrEqual(4.5)
})

test('shouldKeepThePrimaryButtonTextReadable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  // The sign-in button (size lg) and the active language button both carry the gradient.
  expect(
    await lowestBrandActionContrast(page),
    'sign-in primary action text against the gradient (4.5:1)',
  ).toBeGreaterThanOrEqual(4.5)

  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // Users: the page action, the create action and the active role filter (size sm) use the same
  // gradient. Before the type-scale-aware merge, the small one inherited the dark page colour.
  await goToUsers(page)
  await expect(page.getByRole('table')).toBeVisible()
  expect(
    await lowestBrandActionContrast(page),
    'users primary action text against the gradient (4.5:1)',
  ).toBeGreaterThanOrEqual(4.5)
})

test('shouldShowAVisibleFocusRingOnAKeyboardFocusedButton', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  // The first Tab leaves the content region and lands on a real button; a keyboard user must see it.
  await page.keyboard.press('Tab')
  const focus = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement) || element.tagName !== 'BUTTON') {
      return { button: false, visible: false }
    }
    const style = getComputedStyle(element)
    const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
    const ring = style.boxShadow !== 'none' && style.boxShadow !== ''
    return { button: true, visible: outline || ring }
  })

  expect(focus.button, 'the first Tab lands on a button').toBe(true)
  expect(focus.visible, 'the focused button has an outline or a ring').toBe(true)
})

/** Reads the longest transition on the element, normalised to seconds (getComputedStyle may use ms). */
async function transitionSeconds(control: Locator) {
  const raw = await control.evaluate((element) => getComputedStyle(element).transitionDuration)
  return Math.max(
    ...raw.split(',').map((part) => {
      const value = part.trim()
      return value.endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value)
    }),
  )
}

test('shouldReduceMotionWhenTheUserAsksForIt', async ({ page }) => {
  await page.goto('/')
  const signIn = page.getByRole('button', { name: 'Giriş yap' })
  await expect(signIn).toBeVisible()

  // The project's default is `reduce`; both states are set explicitly so the comparison is real.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reduced = await transitionSeconds(signIn)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const normal = await transitionSeconds(signIn)

  expect(reduced, 'reduced motion is effectively off (AC-15)').toBeLessThanOrEqual(0.02)
  expect(normal, 'motion is longer when the user does not ask for less').toBeGreaterThan(reduced)
  // AC-15 fixes the band at 150–200 ms; this catches a token drifting outside it.
  expect(normal, 'motion stays inside the 150–200 ms band').toBeGreaterThanOrEqual(0.15)
  expect(normal, 'motion stays inside the 150–200 ms band').toBeLessThanOrEqual(0.2)

  // The navigation sheet is the other animated surface (AC-15), and it only exists below 1024 px.
  // Sign in, shrink to a phone, open it, and measure the overlay and the panel under both settings.
  await page.setViewportSize({ width: 360, height: 900 })
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Menü' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const overlay = page.locator('[data-slot="sheet-overlay"]')
  const panel = page.locator('[data-slot="sheet-content"]')
  const reducedOverlay = await transitionSeconds(overlay)
  const reducedPanel = await transitionSeconds(panel)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const normalOverlay = await transitionSeconds(overlay)
  const normalPanel = await transitionSeconds(panel)

  expect(reducedOverlay, 'the sheet overlay is off under reduce (AC-15)').toBeLessThanOrEqual(0.02)
  expect(reducedPanel, 'the sheet panel is off under reduce (AC-15)').toBeLessThanOrEqual(0.02)
  expect(normalOverlay, 'the sheet overlay animates without the preference').toBeGreaterThan(0.02)
  expect(normalPanel, 'the sheet panel animates without the preference').toBeGreaterThan(0.02)
  expect(normalOverlay, 'the sheet stays inside the 150–200 ms band').toBeLessThanOrEqual(0.2)
  expect(normalPanel, 'the sheet stays inside the 150–200 ms band').toBeLessThanOrEqual(0.2)
})
