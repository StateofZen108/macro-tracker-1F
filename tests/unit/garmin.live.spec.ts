import { describe, expect, it } from 'vitest'
import { assessGarminLiveReadiness } from '../../scripts/check-garmin-live-readiness.mjs'
import { runGarminLiveSmoke } from '../../scripts/check-garmin-live-smoke.mjs'

const baseEnv = {
  GARMIN_CLIENT_ID: 'client',
  GARMIN_CLIENT_SECRET: 'secret',
  GARMIN_PRODUCTION_BASE_URL: 'https://app.example.com',
  GARMIN_REDIRECT_URI: 'https://app.example.com/api/garmin/callback',
  GARMIN_HEALTH_API_URL: 'https://garmin.example/health',
  GARMIN_TOKEN_KEY_CURRENT_ID: 'current',
  GARMIN_TOKEN_KEY_CURRENT: Buffer.alloc(32, 1).toString('base64'),
  GARMIN_BACKGROUND_SYNC_ENABLED: 'true',
  GARMIN_BACKGROUND_SYNC_SECRET: 'background-secret',
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
} as NodeJS.ProcessEnv

describe('Garmin live readiness', () => {
  it('fails closed when production Garmin credentials are absent', () => {
    const result = assessGarminLiveReadiness({})
    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(expect.arrayContaining([
      'GARMIN_CLIENT_ID is required for Garmin OAuth.',
      'GARMIN_CLIENT_SECRET is required for Garmin OAuth.',
      'GARMIN_REDIRECT_URI is required for Garmin OAuth.',
      'At least one of GARMIN_HEALTH_API_URL or GARMIN_ACTIVITY_API_URL is required for Garmin sync.',
    ]))
  })

  it('passes only with OAuth, encrypted tokens, durable store, background sync, and exact callback', () => {
    expect(assessGarminLiveReadiness(baseEnv).ok).toBe(true)
    expect(assessGarminLiveReadiness({
      ...baseEnv,
      GARMIN_REDIRECT_URI: 'https://app.example.com/api/wrong',
    }).violations).toContain(
      'GARMIN_REDIRECT_URI must equal https://app.example.com/api/garmin/callback for this deployment.',
    )
    expect(assessGarminLiveReadiness({
      ...baseEnv,
      GARMIN_TOKEN_KEY_CURRENT: Buffer.alloc(16, 1).toString('base64'),
    }).violations).toContain('GARMIN_TOKEN_KEY_CURRENT must be a base64-encoded 32-byte key.')
  })
})

describe('Garmin live smoke', () => {
  it('requires an authenticated smoke user token', async () => {
    await expect(runGarminLiveSmoke({
      GARMIN_SMOKE_BASE_URL: 'https://app.example.com',
    } as NodeJS.ProcessEnv)).resolves.toMatchObject({
      ok: false,
      errors: ['GARMIN_SMOKE_USER_ACCESS_TOKEN is required for authenticated Garmin live smoke.'],
    })
  })

  it('verifies status and sync when the user is connected', async () => {
    const calls: string[] = []
    const result = await runGarminLiveSmoke({
      GARMIN_SMOKE_BASE_URL: 'https://app.example.com',
      GARMIN_SMOKE_USER_ACCESS_TOKEN: 'token',
    } as NodeJS.ProcessEnv, async (url) => {
      calls.push(String(url))
      if (String(url).endsWith('/api/garmin/status')) {
        return new Response(JSON.stringify({
          providerConfigured: true,
          persistentStoreConfigured: true,
          backgroundAutomationEnabled: true,
          connection: { status: 'connected' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        records: [],
        connection: { status: 'connected' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    expect(result).toMatchObject({
      ok: true,
      providerConfigured: true,
      persistentStoreConfigured: true,
      backgroundAutomationEnabled: true,
      syncedRecords: 0,
    })
    expect(calls).toEqual([
      'https://app.example.com/api/garmin/status',
      'https://app.example.com/api/garmin/sync',
    ])
  })
})
