import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

/**
 * The real accessibility measurement: a real browser, real CSS, real contrast.
 * jest-axe runs in jsdom, where colour rules are switched off and no stylesheet is loaded, so this
 * test is the one that can actually fail on a contrast regression (spec 0003, AC-3).
 */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`),
    `${label} has accessibility violations`,
  ).toEqual([])
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
  await page.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  // The heading renders before the request answers: scan the list, not the loading state.
  await expect(page.getByRole('table')).toBeVisible()
  await expectNoViolations(page, 'users')

  const deactivate = page.getByRole('button', { name: 'Pasife al' }).first()
  await expect(deactivate).toBeVisible()
  await deactivate.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoViolations(page, 'deactivation dialog')
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

  await employeePage.getByRole('button', { name: 'Kullanıcılar' }).click()
  await expect(employeePage.getByText('Bu sayfaya erişiminiz yok')).toBeVisible()
  await expectNoViolations(employeePage, 'forbidden')

  await employee.close()
})
