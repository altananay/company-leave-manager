import { expect, test } from '@playwright/test'

import { expectTouchTargets, horizontalOverflow } from './layout'
import { goToHome, goToUsers, logOut, navigation, openUsers } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

const WIDTHS = [360, 768, 1440]

test('shouldNotScrollHorizontallyAtAnyWidth', async ({ page }) => {
  // The width contract holds in both themes (spec 0007 AC-5): the dark tokens change colour only.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })

      // Login screen
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
      expect(await horizontalOverflow(page), `login at ${width}px (${scheme})`).toBe(0)

      // Signed-in shell and the users list
      await page.getByLabel('E-posta').fill(HR_EMAIL)
      await page.getByLabel('Parola').fill(HR_PASSWORD)
      await page.getByRole('button', { name: 'Giriş yap' }).click()
      await expect(page.getByText('Giriş yapan:')).toBeVisible()
      expect(await horizontalOverflow(page), `home at ${width}px (${scheme})`).toBe(0)

      // One manageable account so the row actions and the dialog exist at every width.
      await page.evaluate(
        async ({ mode, px }) => {
          const token = (await (await fetch('/api/auth/csrf')).json()).token
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
            body: JSON.stringify({
              email: `wide-${mode}-${px}-${Date.now()}@acme.test`,
              displayName: 'Wide Person',
              role: 'EMPLOYEE',
            }),
          })
        },
        { mode: scheme, px: width },
      )

      // The sidebar below 1024 px is a sheet: the helper opens whichever one is on screen.
      await goToUsers(page)
      await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
      // Wait for the list itself: the heading renders before the request answers.
      await expect(page.getByRole('table')).toBeVisible()
      expect(await horizontalOverflow(page), `users at ${width}px (${scheme})`).toBe(0)

      // The dialog is the tightest layout on a phone: full width minus the page gutter. Row actions
      // live behind the row menu (AC-14).
      await page.getByRole('button', { name: 'İşlemler' }).first().click()
      await page.getByRole('menuitem', { name: 'Pasife al' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await horizontalOverflow(page), `dialog at ${width}px (${scheme})`).toBe(0)
      await page.keyboard.press('Escape')

      await goToHome(page)
      await logOut(page)
    }
  }
})

test('shouldPersistTheThemeChoiceAndFollowTheSystem', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // An explicit dark choice is stored and survives a reload (spec 0007 AC-2).
  await page.getByRole('button', { name: 'Tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Koyu' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)

  // The system option follows the OS live.
  await page.getByRole('button', { name: 'Tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Sistem' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('shouldFitThePasswordAndForbiddenScreensAtEveryWidth', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  const employee = await page.context().browser()!.newContext()
  const employeePage = await employee.newPage()

  for (const width of WIDTHS) {
    // A fresh newcomer per width: the password screen only exists until the password is changed.
    const created = await page.evaluate(async () => {
      const token = (await (await fetch('/api/auth/csrf')).json()).token
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({
          email: `narrow-${Date.now()}@acme.test`,
          displayName: 'Narrow Person',
          role: 'EMPLOYEE',
        }),
      })
      return response.json()
    })

    await employeePage.setViewportSize({ width, height: 900 })
    await employeePage.goto('/')
    await employeePage.getByLabel('E-posta').fill(created.user.email)
    await employeePage.getByLabel('Parola').fill(created.temporaryPassword)
    await employeePage.getByRole('button', { name: 'Giriş yap' }).click()

    await expect(employeePage.getByRole('heading', { name: 'Parola değiştirme' })).toBeVisible()
    expect(await horizontalOverflow(employeePage), `password change at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `password change at ${width}px`)

    await employeePage.getByLabel('Mevcut parola').fill(created.temporaryPassword)
    await employeePage.getByLabel('Yeni parola', { exact: true }).fill('brand-new-pass-123')
    await employeePage.getByLabel('Yeni parola (tekrar)').fill('brand-new-pass-123')
    await employeePage.getByRole('button', { name: 'Parolayı değiştir' }).click()
    await expect(employeePage.getByText('Giriş yapan:')).toBeVisible()

    // The employee reaches the users route, but the API answers 403: the helper must not wait for
    // the list heading, because the forbidden screen is a valid outcome of the same navigation.
    await openUsers(employeePage)
    await expect(
      employeePage.getByRole('heading', { name: 'Bu sayfaya erişiminiz yok' }),
    ).toBeVisible()
    expect(await horizontalOverflow(employeePage), `forbidden at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `forbidden at ${width}px`)

    await logOut(employeePage)
  }

  await employee.close()
})

test('shouldKeepTouchTargetsAtLeast44Pixels', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expectTouchTargets(page, 'login')

  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expectTouchTargets(page, 'home')

  await page.evaluate(async () => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({
        email: `touch-${Date.now()}@acme.test`,
        displayName: 'Touch Person',
        role: 'EMPLOYEE',
      }),
    })
  })

  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  // The search field, the role-filter buttons and the pagination buttons are controls too.
  await expectTouchTargets(page, 'users')

  // The row menu's items are controls too (AC-8, AC-14): open it and measure the two actions.
  await page.getByRole('button', { name: 'İşlemler' }).first().click()
  await expect(page.getByRole('menuitem', { name: 'Pasife al' })).toBeVisible()
  await expectTouchTargets(page, 'row action menu', '[role="menuitem"]:visible')
  await page.keyboard.press('Escape')

  // The role listbox is a control too: open it and measure its options. The form now has a second
  // select (the manager, spec 0004 AC-8), so the role one is named instead of being the only one.
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await expect(page.getByRole('option').first()).toBeVisible()
  await expectTouchTargets(page, 'role listbox', '[role="option"]:visible')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'İşlemler' }).first().click()
  await page.getByRole('menuitem', { name: 'Pasife al' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectTouchTargets(page, 'dialog')
  await page.keyboard.press('Escape')

  // The account menu only exists from 1024 px up; measure its items there too.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'HR Admin' }).click()
  await expect(page.getByRole('menuitem', { name: 'Çıkış' })).toBeVisible()
  await expectTouchTargets(page, 'account menu', '[role="menuitem"]:visible')
})

test('shouldNotScrollInsideTheTableWithALongAddress', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // One unbreakable local part, the worst case for a narrow table cell.
  const longEmail = `${'a'.repeat(48)}@acme.test`
  await page.evaluate(async (email) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ email, displayName: 'Long Address', role: 'EMPLOYEE' }),
    })
  }, longEmail)

  // Both layouts: the stacked cards under md, and the table with `md:truncate` from md up. Only
  // the second width exercises the truncation rule, so both are measured.
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await goToUsers(page)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText(longEmail)).toBeVisible()

    const layout = await page.evaluate((email) => {
      const container = document.querySelector('[data-slot="table-container"]') as HTMLElement
      const table = container?.querySelector('table') as HTMLElement | null
      const cell = Array.from(document.querySelectorAll('[data-slot="table-cell"]')).find((node) =>
        node.textContent?.includes(email),
      )
      // The innermost span holding the address is the one that clips from md up; finding it by
      // its text rather than by a utility class keeps the check about behaviour, not styling.
      const span = Array.from(cell?.querySelectorAll('span') ?? []).find(
        (node) => node.textContent === email,
      )
      const text = span as HTMLElement | null
      return {
        containerWidth: container.getBoundingClientRect().width,
        tableWidth: table?.getBoundingClientRect().width ?? -1,
        overflow: container.scrollWidth - container.clientWidth,
        clipped: text ? text.scrollWidth > text.clientWidth : false,
      }
    }, longEmail)

    // The table must fit the box that holds it — that is the real rule. `scrollWidth` rounds to
    // whole pixels, so it can read one more than `clientWidth` while nothing is clipped; the
    // fractional width comparison above is what catches a table that actually grew.
    expect(layout.tableWidth, `table fits its container at ${width}px`).toBeLessThanOrEqual(
      layout.containerWidth + 0.5,
    )
    expect(layout.overflow, `table container at ${width}px`).toBeLessThanOrEqual(1)
    expect(await horizontalOverflow(page), `document at ${width}px`).toBe(0)
    if (width >= 768) {
      // From md the address is clipped, not wrapped: the proof that the truncation rule is active.
      expect(layout.clipped, 'the address is truncated at md').toBe(true)
    }
    await goToHome(page)
  }
})

test('shouldShowTheContentFocusRingOnlyForTheKeyboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  const mainOutline = () =>
    page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) {
        return 'missing'
      }
      const style = getComputedStyle(main)
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        ? 'ring'
        : 'none'
    })

  // First paint: the content region holds focus, but a mouse user sees no box around the page.
  await expect(page.getByRole('main')).toBeFocused()
  expect(await mainOutline(), 'first paint').toBe('none')

  // A mouse sign-in lands on the shell: the content region holds focus again, with no ring.
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  expect(await mainOutline(), 'after a mouse sign-in').toBe('none')

  // A keyboard user gets the ring: sign out, then submit the form from the keyboard.
  await logOut(page)
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByLabel('Parola').press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  expect(await mainOutline(), 'after a keyboard sign-in').toBe('ring')
})

/**
 * Every control a thumb has to hit lives in ./layout; this file keeps the journey assertions.
 */

test('shouldLoginDenyAndLogout', async ({ page }) => {
  // Anonymous: the shell shows the login screen.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  // Sign in as the seeded HR user and see the healthy shell.
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  // The home screen now carries the balance summary too (spec 0004, L-21): its "no hire date"
  // notice is a second live region, so the health status is selected by its own text.
  // M-09: the text equality is the assertion — `hasText` alone passes on "Sistem çalışıyor…" and
  // would survive a status that only starts with the phrase.
  await expect(page.getByRole('status').filter({ hasText: 'Sistem çalışıyor' })).toHaveText(
    'Sistem çalışıyor',
  )
  // The seeded HR account has no hire date, so the balance card shows the 0-day notice (L-05, D3):
  // the number and the reason are on screen, not a guessed 14-day default.
  await expect(
    page.getByText(/İşe giriş tarihi girilmedi; yıllık izin hakkı hesaplanamıyor \(0 gün\)/),
  ).toBeVisible()
  await expect(page.locator('[data-slot="balance-remaining"]')).toHaveText('0')

  // HR creates an employee and receives a one-time password.
  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()

  const employeeEmail = `e2e-${Date.now()}@acme.test`
  await page.getByLabel('E-posta', { exact: true }).fill(employeeEmail)
  await page.getByLabel('Ad soyad').fill('E2E Employee')
  await page.getByRole('button', { name: 'Oluştur' }).click()

  const temporaryPassword = (await page.locator('code').textContent()) ?? ''
  expect(temporaryPassword.length).toBeGreaterThan(0)

  // Sign out, sign in as the employee: the temporary password must be changed first.
  await goToHome(page)
  await logOut(page)

  await page.getByLabel('E-posta').fill(employeeEmail)
  await page.getByLabel('Parola').fill(temporaryPassword)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(page.getByRole('heading', { name: 'Parola değiştirme' })).toBeVisible()
  await page.getByLabel('Mevcut parola').fill(temporaryPassword)
  await page.getByLabel('Yeni parola', { exact: true }).fill('employee-e2e-password-123')
  await page.getByLabel('Yeni parola (tekrar)').fill('employee-e2e-password-123')
  await page.getByRole('button', { name: 'Parolayı değiştir' }).click()

  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // The employee cannot open the users screen.
  await openUsers(page)
  await expect(page.getByRole('heading', { name: 'Bu sayfaya erişiminiz yok' })).toBeVisible()

  // Sign out, then the shell shows the login screen again and the API refuses the session.
  await goToHome(page)
  // Wait for the logout round trip itself: the screen changes when it answers, and asserting the
  // status keeps a rejected logout from looking like a successful one (run #64 failed here).
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/logout') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Çıkış' }).click()
  const logout = await logoutResponse
  expect(logout.status(), 'logout answers 204').toBe(204)
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  const me = await page.request.get('/api/auth/me')
  expect(me.status(), `logout answered ${logout.status()}`).toBe(401)

  // Reloading the app after the logout lands on the login screen, not on the shell (AC-10).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.getByText('Giriş yapan:')).toHaveCount(0)
})

test('shouldMarkTheActiveNavigationItem', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  const home = navigation(page).getByRole('button', { name: 'Ana ekran' })
  const users = navigation(page).getByRole('button', { name: 'Kullanıcılar' })

  await expect(home).toHaveAttribute('aria-current', 'page')
  await expect(users).not.toHaveAttribute('aria-current', 'page')

  await goToUsers(page)

  await expect(users).toHaveAttribute('aria-current', 'page')
  await expect(home).not.toHaveAttribute('aria-current', 'page')
})

test('shouldOpenTheNavigationAsASheetOnAPhone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // Below 1024 px the sidebar is out of the layout; the same navigation lives in the sheet.
  await expect(page.locator('aside')).toBeHidden()
  const menu = page.getByRole('button', { name: 'Menü' })
  await expect(menu).toBeVisible()

  await menu.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('navigation', { name: 'Ana gezinme' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Kapat' })).toBeVisible()

  await sheet.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Escape closes the sheet and returns the page to its previous layout.
  await menu.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Focus is trapped while the sheet is open: every Tab lands inside the dialog.
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab')
    const trapped = await page.evaluate(() => {
      const sheet = document.querySelector('[role="dialog"]')
      return Boolean(sheet && document.activeElement && sheet.contains(document.activeElement))
    })
    expect(trapped, `tab ${step + 1} stays inside the navigation sheet`).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menu).toBeVisible()
  // The keyboard user goes back to the trigger, not to the top of the document.
  expect(await menu.evaluate((element) => element === document.activeElement)).toBe(true)
})

test('shouldShowTheBrandPanelOnlyOnWideScreens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('[data-slot="brand-panel"]')).toBeVisible()

  // The boundary itself: 1023 is still the single-column layout, 1024 is the two-column one.
  await page.setViewportSize({ width: 1023, height: 900 })
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('[data-slot="brand-panel"]')).toBeHidden()

  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('[data-slot="brand-panel"]')).toBeVisible()

  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.locator('[data-slot="brand-panel"]')).toBeHidden()
})

test('shouldFilterAndPaginateTheUsers', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  // Eleven accounts sort after the seeded ones ("Pager …" starts with P) and carry one marker in
  // their e-mail, so the search can isolate exactly this page's data from the other tests' users.
  const stamp = Date.now()
  const emailPrefix = `pager-${stamp}`
  const accounts = Array.from({ length: 11 }, (_, index) => {
    const suffix = String(index).padStart(2, '0')
    return {
      email: `${emailPrefix}-${suffix}@acme.test`,
      displayName: `Pager ${stamp} ${suffix}`,
    }
  })
  const failed = await page.evaluate(async (accountsToCreate) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const failures: string[] = []
    for (const account of accountsToCreate) {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({ ...account, role: 'EMPLOYEE' }),
      })
      if (!response.ok) {
        failures.push(`${account.email}: ${response.status}`)
      }
    }
    return failures
  }, accounts)
  expect(failed, 'all eleven accounts were created').toEqual([])

  await goToUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()

  const rows = page.locator('tbody tr')
  const search = page.getByLabel('İsim veya e-posta ara')

  // Ten rows per page, even though the environment has more accounts than that.
  await expect(rows).toHaveCount(10)

  await search.fill(emailPrefix)
  await expect(rows).toHaveCount(10)
  await expect(page.getByText('1–10 / 11')).toBeVisible()
  await page.getByRole('button', { name: 'Sonraki' }).click()
  await expect(rows).toHaveCount(1)
  await expect(page.getByText(accounts[10].displayName, { exact: true })).toBeVisible()

  // The search box filters the page down to the one matching account.
  await search.fill(accounts[3].email)
  await expect(rows).toHaveCount(1)
  await expect(page.getByText(accounts[3].displayName, { exact: true })).toBeVisible()

  // The role filter keeps every created employee: the marker still matches all eleven.
  await search.fill(emailPrefix)
  await page.getByRole('button', { name: 'Çalışan', exact: true }).click()
  await expect(rows).toHaveCount(10)
  await expect(page.getByText('1–10 / 11')).toBeVisible()

  // The seeded HR account is the one the HR filter shows.
  await search.fill('')
  await page.getByRole('button', { name: 'İK', exact: true }).click()
  await expect(page.getByText(HR_EMAIL)).toBeVisible()
  await expect(page.getByText(accounts[0].displayName, { exact: true })).toHaveCount(0)
})
