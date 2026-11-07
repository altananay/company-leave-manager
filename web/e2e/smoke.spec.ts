import { expect, test } from '@playwright/test'

// AC-6: the app opens against a real database and shows the healthy state (default language: tr).
test('shouldShowHealthyState', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('status')).toHaveText('Sistem çalışıyor')
})
