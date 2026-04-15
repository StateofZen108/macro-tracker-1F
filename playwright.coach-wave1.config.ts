import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/weight.coach-wave1.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4174',
  },
  webServer: {
    command: 'node scripts/run-coach-wave1-preview.mjs 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
