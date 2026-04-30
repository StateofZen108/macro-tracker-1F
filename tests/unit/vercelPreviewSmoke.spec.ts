import { describe, expect, it } from 'vitest'

import {
  buildBypassHeaders,
  extractBypassCookies,
  isVercelProtectionResponse,
  resolvePreviewSmokeConfig,
} from '../../scripts/check-vercel-preview-smoke.mjs'

describe('Vercel preview smoke helpers', () => {
  it('resolves preview smoke config with strict proof enabled by default', () => {
    expect(
      resolvePreviewSmokeConfig({
        VERCEL_PREVIEW_URL: 'https://preview.vercel.app',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'secret',
      }),
    ).toEqual({
      previewUrl: 'https://preview.vercel.app',
      bypassSecret: 'secret',
      disabled: false,
      strict: true,
    })
  })

  it('detects protected Vercel login responses as blocked smoke, not success', () => {
    expect(
      isVercelProtectionResponse({
        status: 401,
        url: 'https://preview.vercel.app',
        body: '<html>Deployment Protection</html>',
      }),
    ).toBe(true)
    expect(
      isVercelProtectionResponse({
        status: 200,
        url: 'https://preview.vercel.app',
        body: '<div id="root"></div><script src="/assets/index.js"></script>',
      }),
    ).toBe(false)
  })

  it('extracts bypass cookies from Vercel set-cookie headers', () => {
    const headers = new Headers()
    headers.append('set-cookie', '_vercel_jwt=abc; Path=/; HttpOnly; Secure')

    expect(extractBypassCookies(headers)).toEqual(['_vercel_jwt=abc'])
  })

  it('requests the Vercel bypass cookie only on the setup request', () => {
    expect(buildBypassHeaders({ bypassSecret: 'secret', requestCookie: true })).toEqual({
      'x-vercel-protection-bypass': 'secret',
      'x-vercel-set-bypass-cookie': 'true',
    })

    expect(
      buildBypassHeaders({
        bypassSecret: 'secret',
        cookies: ['_vercel_jwt=abc'],
      }),
    ).toEqual({
      'x-vercel-protection-bypass': 'secret',
      cookie: '_vercel_jwt=abc',
    })
  })
})
