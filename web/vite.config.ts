import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // Development only: the SPA talks to the API through the same origin (single-origin deployment).
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Component tests only: e2e/*.spec.ts belongs to Playwright, not Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
