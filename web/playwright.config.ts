import { defineConfig, devices } from '@playwright/test'

// The app under test is started by scripts/e2e (one component owns the lifecycle, resource hygiene rule 4).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:18080',
    headless: true,
    locale: 'tr-TR',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
