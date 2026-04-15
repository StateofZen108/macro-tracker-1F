import type { PlaywrightTestConfig } from '@playwright/test'

export const sharedPlaywrightConfig: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'galaxy-s22-ultra-chrome',
      use: {
        defaultBrowserType: 'chromium',
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
        viewport: { width: 412, height: 839 },
        screen: { width: 412, height: 915 },
        deviceScaleFactor: 3.5,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
}
