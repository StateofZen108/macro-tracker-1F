import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  delete process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1
  delete process.env.FATSECRET_CLIENT_ID
  delete process.env.FATSECRET_CLIENT_SECRET
})

describe('lookupFatSecretBarcode', () => {
  it('maps provider JSON failures into the declared barcode result type', async () => {
    process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1 = 'true'
    process.env.FATSECRET_CLIENT_ID = 'client'
    process.env.FATSECRET_CLIENT_SECRET = 'secret'

    const tokenFetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'retry-after': '60' },
      }),
    ) as unknown as typeof fetch

    const { lookupFatSecretBarcode } = await import('../../server/food-catalog/fatsecret')
    const result = await lookupFatSecretBarcode('0123456789012', {
      fetchImpl,
      tokenFetchImpl,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        provider: 'fatsecret',
        code: 'rateLimited',
        message: 'FatSecret rate-limited the request.',
        retryAfterSeconds: 60,
      },
    })
  })
})
