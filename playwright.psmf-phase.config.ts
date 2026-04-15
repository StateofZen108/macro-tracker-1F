import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/psmf-phase.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4176',
  },
  webServer: {
    command: 'node scripts/run-psmf-phase-preview.mjs 4176',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
