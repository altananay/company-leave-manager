import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { nextBusinessMonday } from './dates'
import { controlContrast, expectTouchTargets, horizontalOverflow } from './layout'
import { goToLeave, logOut, navigation } from './navigation'

const HR_EMAIL = 'hr@e2e.test'
const HR_PASSWORD = 'hr-e2e-password-123'
const EMPLOYEE_PASSWORD = 'leave-e2e-password-123'
const MANAGER_PASSWORD = 'leader-e2e-password-123'

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
  await expect(value).toHaveText(/^\d+([.,]\d+)?$/)
  const text = (await value.textContent()) ?? ''
  return Number(text.trim().replace(',', '.'))
}

/** The balance card's own formatting, so an assertion compares like with like (0,5 in Turkish). */
function dayText(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value)
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
  const start = await nextBusinessMonday(page)
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

test('shouldShowAnApprovedHalfDayInMyLeaveDays', async ({ page, browser }) => {
  // AC-13 (D20), browser-only part: an approved half day arrives from the server and the card renders
  // date, type and half-day in one row, with the 0,5 balance. Create/approve/cancel are proven at the
  // IT layer; the e2e journey budget stays at two (docs/testing.md, review T-1). The balance is read
  // before the request because the entitlement is cumulative and a fixed expectation would age.
  await signIn(page, HR_EMAIL, HR_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  const stamp = Date.now()
  const fixture = await page.evaluate(async (suffix) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const post = (path: string, body: unknown) =>
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify(body),
      }).then((response) => response.json())
    const manager = await post('/api/users', {
      email: `half-lead-${suffix}@acme.test`,
      displayName: `Half Lead ${suffix}`,
      role: 'MANAGER',
    })
    const employee = await post('/api/users', {
      email: `half-${suffix}@acme.test`,
      displayName: `Half Employee ${suffix}`,
      role: 'EMPLOYEE',
      managerId: manager.user.id,
      hireDate: '2024-01-15',
    })
    return {
      employeeEmail: employee.user.email,
      employeePassword: employee.temporaryPassword,
      managerEmail: manager.user.email,
      managerPassword: manager.temporaryPassword,
    }
  }, stamp)
  await logOut(page)

  const employeeContext = await browser.newContext()
  const employeePage = await employeeContext.newPage()
  await signInAs(employeePage, fixture.employeeEmail, fixture.employeePassword, EMPLOYEE_PASSWORD)
  await goToLeave(employeePage)
  const before = await remaining(employeePage)
  const day = await nextBusinessMonday(employeePage)
  const created = await employeePage.evaluate(async (startDate) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const response = await fetch('/api/leave/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({
        type: 'ANNUAL',
        startDate,
        endDate: startDate,
        halfDay: 'PM',
        reason: 'yarım gün',
      }),
    })
    return { status: response.status, body: (await response.json()) as { id?: string } }
  }, day)
  expect(created.status, 'the employee records a half day').toBe(201)

  // The manager approves the request through the API (no second UI journey).
  const managerContext = await browser.newContext()
  const managerPage = await managerContext.newPage()
  await signInAs(managerPage, fixture.managerEmail, fixture.managerPassword, MANAGER_PASSWORD)
  const approved = await managerPage.evaluate(async (requestId) => {
    const token = (await (await fetch('/api/auth/csrf')).json()).token
    const response = await fetch(`/api/leave/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: '{}',
    })
    return response.status
  }, created.body.id)
  expect(approved, 'the half day is approved').toBe(200)
  await managerContext.close()

  await employeePage.reload()
  await expect(employeePage.getByRole('heading', { name: 'İzin talepleri' })).toBeVisible()
  await expect(employeePage.locator('[data-slot="balance-remaining"]')).toHaveText(
    dayText(before - 0.5),
  )
  expect(await remaining(employeePage), 'the balance carries the half day').toBe(before - 0.5)

  const rows = employeePage.locator('[data-slot="my-leave-day"]')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(day.split('-').reverse().join('.'))
  await expect(rows.first()).toContainText('Öğleden sonra')

  // T-2: the row is on the page while axe measures it, and the new row/control are measured at the
  // three widths, not only the list and the empty dialog.
  const results = await new AxeBuilder({ page: employeePage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.map((rule) => `${rule.id}: ${rule.nodes.length} node(s)`),
    'the leave screen with an approved half day has accessibility violations',
  ).toEqual([])

  for (const width of [360, 768, 1440]) {
    await employeePage.setViewportSize({ width, height: 900 })
    await goToLeave(employeePage)
    await expect(rows.first()).toBeVisible()
    expect(await horizontalOverflow(employeePage), `my leave days at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `my leave days at ${width}px`)

    await employeePage.getByRole('button', { name: 'Yeni talep' }).click()
    const dialog = employeePage.getByRole('dialog')
    await dialog.getByLabel('Başlangıç').fill(day)
    await dialog.getByLabel('Bitiş').fill(day)
    await expect(dialog.getByRole('combobox', { name: 'Yarım gün' })).toBeVisible()
    expect(await horizontalOverflow(employeePage), `half-day dialog at ${width}px`).toBe(0)
    await expectTouchTargets(employeePage, `half-day dialog at ${width}px`)
    await employeePage.keyboard.press('Escape')
    await expect(employeePage.getByRole('dialog')).toHaveCount(0)
  }

  await employeeContext.close()
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

test('shouldFitTheManagerQueueAndTheHrAdjustmentAtEveryWidth', async ({ page, browser }) => {
  // Six measured states (two roles × three widths) do not fit the default 30 s budget.
  test.setTimeout(90_000)
  // L-20: the manager queue, its decision dialog and the HR adjustment row are measured at the
  // three widths, not only the employee's list.
  await signIn(page, HR_EMAIL, HR_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()

  const stamp = Date.now()
  const start = await nextBusinessMonday(page)
  const fixture = await page.evaluate(
    async ({ suffix, startDate }) => {
      const token = (await (await fetch('/api/auth/csrf')).json()).token
      const post = (path: string, body: unknown) =>
        fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
          body: JSON.stringify(body),
        }).then((response) => response.json())
      const manager = await post('/api/users', {
        email: `width-lead-${suffix}@acme.test`,
        displayName: `Width Lead ${suffix}`,
        role: 'MANAGER',
      })
      const employee = await post('/api/users', {
        email: `width-staff-${suffix}@acme.test`,
        displayName: `Width Staff ${suffix}`,
        role: 'EMPLOYEE',
        managerId: manager.user.id,
        hireDate: '2024-01-15',
      })
      await post('/api/leave/requests', {
        type: 'ANNUAL',
        startDate,
        endDate: startDate,
        reason: 'width scan',
        employeeId: employee.user.id,
      })
      return {
        managerEmail: manager.user.email,
        managerPassword: manager.temporaryPassword,
        employeeName: employee.user.displayName,
      }
    },
    { suffix: stamp, startDate: start },
  )

  // The HR adjustment row is filled once; the loop then measures the same row at each width. The
  // open listbox is not measured here but once, while it is open, in
  // `shouldKeepTheHrEmployeeListboxMeasurableWhileOpen` (boundary contrast + 44 px options): Radix
  // portals it and its geometry is width-independent, so a per-width pass would add nothing.
  await goToLeave(page)
  await page.getByRole('combobox', { name: 'Çalışan' }).click()
  await page.getByRole('option', { name: fixture.employeeName, exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option', { name: fixture.employeeName, exact: true })).toHaveCount(0)
  await page.getByLabel('Gün (eksi düşürür)').fill('2')
  await page.getByLabel('Gerekçe').fill('genişlik düzeltmesi')

  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await goToLeave(page)
    await expect(page.getByRole('heading', { name: 'İzin talepleri' })).toBeVisible()

    expect(await horizontalOverflow(page), `HR adjustment form at ${width}px`).toBe(0)
    await expectTouchTargets(page, `HR adjustment at ${width}px`)
  }

  const managerContext = await browser.newContext()
  const managerPage = await managerContext.newPage()
  await signIn(managerPage, fixture.managerEmail, fixture.managerPassword)
  await changePasswordIfAsked(managerPage, fixture.managerPassword, MANAGER_PASSWORD)
  await expect(managerPage.getByText('Giriş yapan:')).toBeVisible()

  for (const width of [360, 768, 1440]) {
    await managerPage.setViewportSize({ width, height: 900 })
    await goToLeave(managerPage)
    const queue = managerPage.locator('[data-slot="card"]').filter({ hasText: 'Onay kuyruğu' })
    await expect(queue.getByText(fixture.employeeName)).toBeVisible()

    expect(await horizontalOverflow(managerPage), `manager queue at ${width}px`).toBe(0)
    await expectTouchTargets(managerPage, `manager queue at ${width}px`)

    await queue.getByRole('button', { name: 'Onayla' }).click()
    await expect(managerPage.getByRole('dialog')).toBeVisible()
    expect(await horizontalOverflow(managerPage), `decision dialog at ${width}px`).toBe(0)
    await expectTouchTargets(managerPage, `decision dialog at ${width}px`)
    await managerPage.keyboard.press('Escape')
    await expect(managerPage.getByRole('dialog')).toHaveCount(0)
  }

  await managerContext.close()
})

test('shouldKeepTheHrEmployeeListboxMeasurableWhileOpen', async ({ page }) => {
  // N-05: nobody measured the /leave employee listbox while it was open. The accessibility scan
  // closes it first (Radix marks the page `aria-hidden`, so axe would report a false
  // `aria-hidden-focus` violation) and the width loop measures the page, not the portaled popup.
  // Measured once here, while it is open: the popup boundary against the card behind it (WCAG
  // 1.4.11, 3:1) and every option as a 44 px touch target.
  await signIn(page, HR_EMAIL, HR_PASSWORD)
  await expect(page.getByText('Giriş yapan:')).toBeVisible()
  const stamp = Date.now()
  const employeeName = `Listbox Employee ${stamp}`
  await page.evaluate(
    async ({ suffix, displayName }) => {
      const token = (await (await fetch('/api/auth/csrf')).json()).token
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({
          email: `listbox-${suffix}@acme.test`,
          displayName,
          role: 'EMPLOYEE',
        }),
      })
    },
    { suffix: stamp, displayName: employeeName },
  )

  await goToLeave(page)
  await page.getByRole('combobox', { name: 'Çalışan' }).click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()

  expect(
    await controlContrast(page, '[role="listbox"]', '[data-slot="card"]'),
    'employee listbox border',
  ).toBeGreaterThanOrEqual(3)

  const options = page.getByRole('option')
  const count = await options.count()
  expect(count, 'the employee listbox lists the fixture account').toBeGreaterThan(0)
  await expect(options.filter({ hasText: employeeName })).toBeVisible()
  for (let index = 0; index < count; index += 1) {
    const box = await options.nth(index).boundingBox()
    expect(box?.height ?? 0, `employee option ${index} height`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `employee option ${index} width`).toBeGreaterThanOrEqual(44)
  }

  await page.keyboard.press('Escape')
  await expect(listbox).toHaveCount(0)
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
