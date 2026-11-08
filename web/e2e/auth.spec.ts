import { expect, test } from '@playwright/test'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'

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
