import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/garmin-connect.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4178',
  },
  webServer: {
    command: 'node scripts/run-garmin-connect-preview.mjs 4178',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
