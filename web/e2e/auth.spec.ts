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

test('shouldNotScrollHorizontallyOnThePasswordAndForbiddenScreens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
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
        email: `narrow-${Date.now()}@acme.test`,
        displayName: 'Narrow Person',
        role: 'EMPLOYEE',
      }),
    })
    return response.json()
  })

  const employee = await page.context().browser()!.newContext()
  const employeePage = await employee.newPage()
  await employeePage.setViewportSize({ width: 360, height: 900 })
  await employeePage.goto('/')
  await employeePage.getByLabel('E-posta').fill(created.user.email)
  await employeePage.getByLabel('Parola').fill(created.temporaryPassword)
  await employeePage.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(employeePage.getByRole('heading', { name: 'Parola değiştirme' })).toBeVisible()
  expect(await horizontalOverflow(employeePage), 'password change at 360px').toBe(0)

  await employeePage.getByLabel('Mevcut parola').fill(created.temporaryPassword)
  await employeePage.getByLabel('Yeni parola', { exact: true }).fill('brand-new-pass-123')
  await employeePage.getByLabel('Yeni parola (tekrar)').fill('brand-new-pass-123')
  await employeePage.getByRole('button', { name: 'Parolayı değiştir' }).click()
  await expect(employeePage.getByText('Giriş yapan:')).toBeVisible()

  await employeePage.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(employeePage.getByText('Bu sayfaya erişiminiz yok')).toBeVisible()
  expect(await horizontalOverflow(employeePage), 'forbidden at 360px').toBe(0)

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
  await expectTouchTargets(page, 'users')

  await page.getByRole('button', { name: 'Pasife al' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectTouchTargets(page, 'dialog')
})

/** Every control a thumb has to hit: buttons, fields and the role combobox (AC-8). */
async function expectTouchTargets(page: import('@playwright/test').Page, label: string) {
  const controls = page.locator('button:visible, input:visible, [role="combobox"]:visible')
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
  await page.getByRole('button', { name: 'Çıkış' }).click()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  const me = await page.request.get('/api/auth/me')
  expect(me.status()).toBe(401)

  // Reloading the app after the logout lands on the login screen, not on the shell (AC-10).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
  await expect(page.getByText('Giriş yapan:')).toHaveCount(0)
})
