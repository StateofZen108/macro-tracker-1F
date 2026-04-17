import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testMatch: '**/qa-release.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
