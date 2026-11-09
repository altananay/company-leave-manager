import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { expectTouchTargets, horizontalOverflow } from './layout'
import { goToLeave, logOut, navigation } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'
const EMPLOYEE_PASSWORD = 'leave-e2e-password-123'
const MANAGER_PASSWORD = 'leader-e2e-password-123'

/** A Monday at least a week ahead: the request is always in the future (BR-11). */
function nextMonday(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  while (date.getDay() !== 1) {
    date.setDate(date.getDate() + 1)
  }
  return isoDate(date)
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Parola').fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
}

/** A created account must change its temporary password first; the HR account never sees the gate. */
async function changePasswordIfAsked(page: Page, temporaryPassword: string, next: string) {
  const heading = page.getByRole('heading', { name: 'Parola değiştirme' })
  await expect(
    page.getByText('Giriş yapan:').or(heading),
    'the session reaches the shell or the password gate',
  ).toBeVisible()
  if (await heading.isVisible()) {
    await page.getByLabel('Mevcut parola').fill(temporaryPassword)
    await page.getByLabel('Yeni parola', { exact: true }).fill(next)
    await page.getByLabel('Yeni parola (tekrar)').fill(next)
    await page.getByRole('button', { name: 'Parolayı değiştir' }).click()
    await expect(page.getByText('Giriş yapan:')).toBeVisible()
  }
}

async function signInAs(page: Page, email: string, temporaryPassword: string, next: string) {
  await signIn(page, email, temporaryPassword)
  await changePasswordIfAsked(page, temporaryPassword, next)
}

/** The remaining days as the balance card shows them; the server computed the number. */
async function remaining(page: Page): Promise<number> {
  const value = page.locator('[data-slot="balance-remaining"]')
  await expect(value).toHaveText(/\d+/)
  return Number(await value.textContent())
}

/** HR creates one account through the users screen and returns its temporary password. */
async function createAccountThroughTheForm(
  page: Page,
  account: {
    email: string
    displayName: string
    role: 'Çalışan' | 'Yönetici'
    managerName?: string
    hireDate?: string
  },
): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
  await page.getByLabel('E-posta', { exact: true }).fill(account.email)
  await page.getByLabel('Ad soyad').fill(account.displayName)
  await page.getByRole('combobox', { name: 'Rol' }).click()
  await page.getByRole('option', { name: account.role, exact: true }).click()
  if (account.managerName) {
    await page.getByRole('combobox', { name: 'Yönetici' }).click()
    await page.getByRole('option', { name: account.managerName, exact: true }).click()
  }
  if (account.hireDate) {
    await page.getByLabel('İşe giriş tarihi').fill(account.hireDate)
  }
  // The one-time password is a fresh message: wait until the code shows the new account's. Reading
  // the previous alert would hand the caller another account's password.
  const passwords = page.locator('code')
  const previous = (await passwords.count()) > 0 ? await passwords.first().textContent() : null
  await page.getByRole('button', { name: 'Oluştur' }).click()
  if (previous) {
    await expect(passwords.first()).not.toHaveText(previous)
  } else {
    await expect(passwords.first()).toBeVisible()
  }
  const password = (await passwords.first().textContent()) ?? ''
  expect(password.length, `${account.email} received a temporary password`).toBeGreaterThan(0)
  return password
}

test('shouldRequestApproveAndCancelLeave', async ({ page }) => {
  const stamp = Date.now()
  const managerEmail = `lead-${stamp}@acme.test`
  const employeeEmail = `leave-${stamp}@acme.test`
  const employeeName = `Leave E2E ${stamp}`

  // HR builds the team through the user form: a manager, then an employee connected to it (AC-8).
  await signIn(page, HR_EMAIL, HR_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name: 'Kullanıcılar' })
    .click()
  const managerPassword = await createAccountThroughTheForm(page, {
    email: managerEmail,
    displayName: `Lead E2E ${stamp}`,
    role: 'Yönetici',
  })
  const employeePassword = await createAccountThroughTheForm(page, {
    email: employeeEmail,
    displayName: employeeName,
    role: 'Çalışan',
    managerName: `Lead E2E ${stamp}`,
    hireDate: '2024-01-15',
  })
  await logOut(page)

  // The employee requests two working days; the summary is the server's answer (AC-1).
  await signInAs(page, employeeEmail, employeePassword, EMPLOYEE_PASSWORD)
  await goToLeave(page)
  const before = await remaining(page)
  const start = nextMonday()
  await page.getByRole('button', { name: 'Yeni talep' }).click()
  const requestDialog = page.getByRole('dialog')
  await expect(requestDialog.getByRole('heading', { name: 'Yeni izin talebi' })).toBeVisible()
  await requestDialog.getByLabel('Başlangıç').fill(start)
  await requestDialog.getByLabel('Bitiş').fill(plusDays(start, 1))
  await requestDialog.getByLabel('Gerekçe').fill('aile ziyareti')
  const summary =
    (await requestDialog.getByText(/iş günü · Talepten sonra kalan/).textContent()) ?? ''
  const days = Number(summary.match(/(\d+) iş günü/)?.[1])
  expect(days, 'the preview counts the working days').toBeGreaterThan(0)
  await requestDialog.getByRole('button', { name: 'Talebi gönder' }).click()

  await expect(page.getByText('İzin talebi oluşturuldu.')).toBeVisible()
  await expect(page.locator('[data-slot="balance-remaining"]')).toHaveText(String(before - days))
  await expect(page.getByRole('table').getByText('Bekliyor')).toBeVisible()
  await logOut(page)

  // The manager sees the pending request in the queue and approves it (BR-7).
  await signInAs(page, managerEmail, managerPassword, MANAGER_PASSWORD)
  await goToLeave(page)
  const queue = page.locator('[data-slot="card"]').filter({ hasText: 'Onay kuyruğu' })
  await expect(queue.getByText(employeeName)).toBeVisible()
  await queue.getByRole('button', { name: 'Onayla' }).click()
  const approveDialog = page.getByRole('dialog')
  await expect(approveDialog.getByText('Bu talep onaylanacak ve bakiye düşecek.')).toBeVisible()
  await approveDialog.getByRole('button', { name: 'Onayla' }).click()

  await expect(page.getByText('Karar kaydedildi.')).toBeVisible()
  await expect(queue.getByText('Bekleyen talep yok.')).toBeVisible()
  await expect(page.getByRole('table').getByText('Onaylandı')).toBeVisible()
  await logOut(page)

  // Approved leave stays deducted; cancelling before it starts restores the balance (BR-8).
  await signIn(page, employeeEmail, EMPLOYEE_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  await goToLeave(page)
  await expect(page.locator('[data-slot="balance-remaining"]')).toHaveText(String(before - days))
  await page.getByRole('button', { name: 'Talebi iptal et' }).click()
  const cancelDialog = page.getByRole('dialog')
  await expect(
    cancelDialog.getByText(
      'Onaylanmış talep, başlangıç tarihinden önce iptal edilirse bakiye geri yüklenir.',
    ),
  ).toBeVisible()
  await cancelDialog.getByRole('button', { name: 'Talebi iptal et' }).click()

  await expect(page.getByText('Talep iptal edildi; bakiye geri yüklendi.')).toBeVisible()
  await expect(page.locator('[data-slot="balance-remaining"]')).toHaveText(String(before))
  await expect(page.getByRole('table').getByText('İptal edildi')).toBeVisible()

  // The screen carries no accessibility violation once a real request is on it.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.map((rule) => `${rule.id}: ${rule.nodes.length} node(s)`),
    'the leave screen has accessibility violations',
  ).toEqual([])
})

test('shouldFitTheLeaveScreenAtEveryWidth', async ({ page, browser }) => {
  // HR creates the employee through the API here; the journey above covers the form itself.
  await signIn(page, HR_EMAIL, HR_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
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
      email: `width-lead-${suffix}@acme.test`,
      displayName: `Width Lead ${suffix}`,
      role: 'MANAGER',
    })
    const employee = await post({
      email: `width-${suffix}@acme.test`,
      displayName: `Width Employee ${suffix}`,
      role: 'EMPLOYEE',
      managerId: manager.user.id,
      hireDate: '2024-01-15',
    })
    return { email: employee.user.email, password: employee.temporaryPassword }
  }, stamp)
  await logOut(page)

  const employeeContext = await browser.newContext()
  const employeePage = await employeeContext.newPage()
  await signInAs(employeePage, created.email, created.password, EMPLOYEE_PASSWORD)

  for (const width of [360, 768, 1440]) {
    await employeePage.setViewportSize({ width, height: 900 })
    await goToLeave(employeePage)
    await expect(employeePage.locator('[data-slot="balance-remaining"]')).toHaveText(/\d+/)

    expect(await horizontalOverflow(employeePage), `leave at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `leave at ${width}px`)

    // The request dialog is the tightest layout on a phone.
    await employeePage.getByRole('button', { name: 'Yeni talep' }).click()
    await expect(employeePage.getByRole('dialog')).toBeVisible()
    expect(await horizontalOverflow(employeePage), `request dialog at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `request dialog at ${width}px`)
    await employeePage.keyboard.press('Escape')
    await expect(employeePage.getByRole('dialog')).toHaveCount(0)
  }

  await employeeContext.close()
})

test('shouldServeTheNestedRouteDirectly', async ({ page }) => {
  // The server answers the nested route with the shell (backlog B-4); the SPA then signs in and
  // lands on the screen the path names (AC-9).
  const response = await page.goto('/leave/requests')
  expect(response?.status(), 'GET /leave/requests answers 200').toBe(200)
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()

  await page.getByLabel('E-posta').fill(HR_EMAIL)
  await page.getByLabel('Parola').fill(HR_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(page.getByRole('heading', { name: 'İzin talepleri' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/leave/requests')
  await expect(
    navigation(page).getByRole('button', { name: 'İzin talepleri' }),
    'the nested route marks its navigation item',
  ).toHaveAttribute('aria-current', 'page')
})
