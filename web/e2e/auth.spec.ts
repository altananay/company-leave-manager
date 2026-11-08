import { expect, test } from '@playwright/test'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

const WIDTHS = [360, 768, 1440]

test('shouldNotScrollHorizontallyAtAnyWidth', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })

    // Login screen
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
    expect(await horizontalOverflow(page), `login at ${width}px`).toBe(0)

    // Signed-in shell and the users list
    await page.getByLabel('E-posta').fill(HR_EMAIL)
    await page.getByLabel('Parola').fill(HR_PASSWORD)
    await page.getByRole('button', { name: 'Giriş yap' }).click()
    await expect(page.getByText('Giriş yapan:')).toBeVisible()
    expect(await horizontalOverflow(page), `home at ${width}px`).toBe(0)

    // One manageable account so the row actions and the dialog exist at every width.
    await page.evaluate(async () => {
      const token = (await (await fetch('/api/auth/csrf')).json()).token
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({
          email: `wide-${Date.now()}@acme.test`,
          displayName: 'Wide Person',
          role: 'EMPLOYEE',
        }),
      })
    })

    await page.getByRole('button', { name: 'Kullanıcılar' }).click()
    await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
    // Wait for the list itself: the heading renders before the request answers.
    await expect(page.getByRole('table')).toBeVisible()
    expect(await horizontalOverflow(page), `users at ${width}px`).toBe(0)

    // The dialog is the tightest layout on a phone: full width minus the page gutter.
    await page.getByRole('button', { name: 'Pasife al' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await horizontalOverflow(page), `dialog at ${width}px`).toBe(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Geri' }).click()
    await page.getByRole('button', { name: 'Çıkış' }).click()
    await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  }
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

    await employeePage.getByRole('button', { name: 'Kullanıcılar' }).click()
    await expect(employeePage.getByText('Bu sayfaya erişiminiz yok')).toBeVisible()
    expect(await horizontalOverflow(employeePage), `forbidden at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `forbidden at ${width}px`)

    await employeePage.getByRole('button', { name: 'Geri' }).click()
    await employeePage.getByRole('button', { name: 'Çıkış' }).click()
    await expect(employeePage.getByRole('heading', { name: 'Giriş' })).toBeVisible()
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

  await page.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expectTouchTargets(page, 'users')

  // The role listbox is a control too: open it and measure its options.
  await page.getByRole('combobox').click()
  await expect(page.getByRole('option').first()).toBeVisible()
  await expectTouchTargets(page, 'role listbox', '[role="option"]:visible')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Pasife al' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectTouchTargets(page, 'dialog')
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
    await page.getByRole('button', { name: 'Kullanıcılar' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText(longEmail)).toBeVisible()

    const layout = await page.evaluate((email) => {
      const container = document.querySelector('[data-slot="table-container"]') as HTMLElement
      const table = container?.querySelector('table') as HTMLElement | null
      const cell = Array.from(document.querySelectorAll('[data-slot="table-cell"]')).find((node) =>
        node.textContent?.includes(email),
      )
      const span = cell?.querySelector('span') as HTMLElement | null
      return {
        containerWidth: container.getBoundingClientRect().width,
        tableWidth: table?.getBoundingClientRect().width ?? -1,
        overflow: container.scrollWidth - container.clientWidth,
        clipped: span ? span.scrollWidth > span.clientWidth : false,
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
    await page.getByRole('button', { name: 'Geri' }).click()
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

  // A keyboard user gets the ring: submit the form from the keyboard.
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByLabel('Parola').press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  expect(await mainOutline(), 'after a keyboard submit').toBe('ring')
})

/** Every control a thumb has to hit: buttons, fields, the combobox and listbox options (AC-8). */
async function expectTouchTargets(
  page: import('@playwright/test').Page,
  label: string,
  selector = 'button:visible, input:visible, [role="combobox"]:visible',
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

async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test('shouldLoginDenyAndLogout', async ({ page }) => {
  // Anonymous: the shell shows the login screen.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  // Sign in as the seeded HR user and see the healthy shell.
  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Sistem çalışıyor')

  // HR creates an employee and receives a one-time password.
  await page.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()

  const employeeEmail = `e2e-${Date.now()}@acme.test`
  await page.getByLabel('E-posta').fill(employeeEmail)
  await page.getByLabel('Ad soyad').fill('E2E Employee')
  await page.getByRole('button', { name: 'Oluştur' }).click()

  const temporaryPassword = (await page.locator('code').textContent()) ?? ''
  expect(temporaryPassword.length).toBeGreaterThan(0)

  // Sign out, sign in as the employee: the temporary password must be changed first.
  await page.getByRole('button', { name: 'Geri' }).click()
  await page.getByRole('button', { name: 'Çıkış' }).click()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

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
  await page.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(page.getByText('Bu sayfaya erişiminiz yok')).toBeVisible()

  // Sign out, then the shell shows the login screen again and the API refuses the session.
  await page.getByRole('button', { name: 'Geri' }).click()
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
