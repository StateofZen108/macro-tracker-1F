import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/personal-library.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4175',
  },
  webServer: {
    command: 'node scripts/run-personal-library-preview.mjs 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
