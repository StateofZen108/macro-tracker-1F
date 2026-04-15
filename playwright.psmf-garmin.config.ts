import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/psmf-garmin.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4179',
  },
  webServer: {
    command: 'node scripts/run-psmf-garmin-preview.mjs 4179',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
