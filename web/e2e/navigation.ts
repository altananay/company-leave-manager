import { expect, type Page } from '@playwright/test'

const navigation = (page: Page) => page.getByRole('navigation', { name: 'Ana gezinme' })

/**
 * The shell has one navigation, in two containers (AC-11): the persistent sidebar from 1024 px up,
 * and the sheet below it. The `Menü` trigger only exists while the sidebar is hidden, so its
 * visibility is the breakpoint check — no hard-coded width in the tests.
 */
async function openNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Menü' })
  if (await menu.isVisible()) {
    await menu.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }
}

/** Clicks the users item without assuming the account may see the screen: 403 is a valid outcome. */
async function openUsers(page: Page) {
  await openNavigation(page)
  await navigation(page).getByRole('button', { name: 'Kullanıcılar' }).click()
}

async function goToUsers(page: Page) {
  await openUsers(page)
  await expect(page.getByRole('heading', { name: 'Kullanıcılar' })).toBeVisible()
}

async function goToHome(page: Page) {
  await openNavigation(page)
  await navigation(page).getByRole('button', { name: 'Ana ekran' }).click()
  await expect(page.getByRole('heading', { name: 'Ana ekran' })).toBeVisible()
}

async function logOut(page: Page) {
  await openNavigation(page)
  await page.getByRole('button', { name: 'Çıkış' }).click()
  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible()
}

export { goToHome, goToUsers, logOut, navigation, openNavigation, openUsers }
