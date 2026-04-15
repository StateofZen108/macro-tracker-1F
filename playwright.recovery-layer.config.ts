import { defineConfig } from '@playwright/test'
import { sharedPlaywrightConfig } from './playwright.base.config'

export default defineConfig({
  ...sharedPlaywrightConfig,
  testDir: './tests/e2e/preview',
  testMatch: '**/recovery-layer.preview.spec.ts',
  use: {
    ...sharedPlaywrightConfig.use,
    baseURL: 'http://127.0.0.1:4177',
  },
  webServer: {
    command: 'node scripts/run-recovery-layer-preview.mjs 4177',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
