import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import observabilitySmokeRoute from '../../api/observability/smoke'
import { withApiMiddleware } from '../../server/http/apiMiddleware'
import { ApiError, GENERIC_INTERNAL_ERROR_MESSAGE } from '../../server/http/errors'
import { resetInMemoryRateLimitForTests } from '../../server/http/rateLimit'
import { redactSentryEvent as redactServerSentryEvent } from '../../server/observability/sentry.server'
import { redactClientSentryEvent } from '../../src/observability/sentry.client'
import { findModuleBudgetViolations } from '../../scripts/check-module-budgets.mjs'
import { validateProductionReadinessManifest } from '../../scripts/check-production-readiness.mjs'
import { runSentrySmoke } from '../../scripts/check-sentry-smoke.mjs'
import {
  findReleaseHygieneViolations,
  parsePorcelainStatus,
} from '../../scripts/check-release-hygiene.mjs'
import {
  REQUIRED_DEVICE_QA_CHECKS,
  validateDeviceQaEvidence,
} from '../../scripts/check-device-qa-evidence.mjs'

describe('production hardening scripts', () => {
  it('classifies dirty source files while allowing ignored generated artifacts', () => {
    const entries = parsePorcelainStatus(
      [
        ' M src/App.tsx',
        '?? src/new-module.ts',
        '?? dist/assets/index.js',
        '?? tmp/debug.json',
      ].join('\n'),
    )

    expect(
      findReleaseHygieneViolations(entries, {
        VITE_APP_BUILD_ID: 'build-1',
      }),
    ).toEqual([
      'Tracked source change is not committed: src/App.tsx',
      'Unknown untracked source artifact: src/new-module.ts',
    ])
  })

  it('requires complete physical-device evidence for the current build', () => {
    const manifest = {
      buildId: 'build-1',
      gitSha: 'abc123',
      checkedAt: '2026-04-28T12:00:00.000Z',
      tester: 'QA',
      device: 'physical_android',
      deviceModel: 'Pixel 8',
      osVersion: 'Android 16',
      browser: 'Chrome',
      installMode: 'pwa',
      checks: REQUIRED_DEVICE_QA_CHECKS.map((id) => ({
        id,
        status: 'passed',
        evidence: `evidence/${id}.png`,
      })),
    }

    expect(validateDeviceQaEvidence(manifest, { buildId: 'build-1', gitSha: 'abc123' })).toEqual([])
    expect(validateDeviceQaEvidence({ ...manifest, gitSha: 'old' }, { buildId: 'build-1', gitSha: 'abc123' }))
      .toContain('Device QA gitSha mismatch: expected abc123, got old.')
  })

  it('requires complete production readiness evidence for the current build', () => {
    const manifest = {
      buildId: 'build-1',
      gitSha: 'abc123',
      checkedAt: '2026-04-28T12:00:00.000Z',
      releaseSuitePassed: true,
      deviceQaManifestPath: 'docs/device-qa-results/build-1.json',
      sentrySmokeEventId: 'event-1',
      sentryAlertsVerified: true,
      supabaseMigrationVerified: true,
      moduleBudgetPassed: true,
    }

    expect(validateProductionReadinessManifest(manifest, { buildId: 'build-1', gitSha: 'abc123' })).toEqual([])
    expect(validateProductionReadinessManifest({ ...manifest, moduleBudgetPassed: false }, { buildId: 'build-1', gitSha: 'abc123' }))
      .toContain('Readiness manifest requires moduleBudgetPassed=true.')
  })

  it('enforces public root module budgets', () => {
    expect(findModuleBudgetViolations()).toEqual([])
  })
})

describe('observability redaction', () => {
  it('redacts sensitive client and server event fields', () => {
    const event = {
      user: {
        email: 'user@example.com',
      },
      extra: {
        Authorization: 'Bearer token',
        foodName: 'Banana',
        imageBase64: 'data:image/png;base64,ZmFrZQ==',
        safe: 'message from user@example.com',
      },
    }

    expect(redactClientSentryEvent(event)).toMatchObject({
      user: {
        email: '[redacted]',
      },
      extra: {
        Authorization: '[redacted]',
        foodName: '[redacted]',
        imageBase64: '[redacted]',
        safe: 'message from [redacted-email]',
      },
    })
    expect(redactServerSentryEvent(event)).toMatchObject({
      extra: {
        Authorization: '[redacted]',
      },
    })
  })
})

describe('API middleware', () => {
  beforeEach(() => {
    resetInMemoryRateLimitForTests()
    delete process.env.API_RATE_LIMIT_DISABLED
    delete process.env.API_MIDDLEWARE_DISABLED
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds request IDs to success and structured error responses', async () => {
    const route = withApiMiddleware(
      {
        routeId: 'test.route',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
      },
      async () => new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    const response = await route.fetch(new Request('http://localhost/api/test'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Request-Id')).toBeTruthy()
  })

  it('redacts unknown and private API errors while preserving public ApiError copy', async () => {
    const unknownRoute = withApiMiddleware(
      {
        routeId: 'test.unknown_error',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
      },
      async () => {
        throw new Error('SQL token abc')
      },
    )
    const unknownResponse = await unknownRoute.fetch(new Request('http://localhost/api/test'))
    await expect(unknownResponse.json()).resolves.toMatchObject({
      error: {
        code: 'internalServerError',
        message: GENERIC_INTERNAL_ERROR_MESSAGE,
      },
    })

    const privateRoute = withApiMiddleware(
      {
        routeId: 'test.private_error',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
      },
      async () => {
        throw new ApiError(502, 'providerFailed', 'Provider token leaked', { exposure: 'private' })
      },
    )
    const privateResponse = await privateRoute.fetch(new Request('http://localhost/api/test'))
    await expect(privateResponse.json()).resolves.toMatchObject({
      error: {
        code: 'providerFailed',
        message: GENERIC_INTERNAL_ERROR_MESSAGE,
      },
    })

    const publicRoute = withApiMiddleware(
      {
        routeId: 'test.public_error',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
      },
      async () => {
        throw new ApiError(400, 'badRequest', 'Fix the request.')
      },
    )
    const publicResponse = await publicRoute.fetch(new Request('http://localhost/api/test'))
    await expect(publicResponse.json()).resolves.toMatchObject({
      error: {
        code: 'badRequest',
        message: 'Fix the request.',
      },
    })
  })

  it('enforces body limits before handlers run', async () => {
    const handler = vi.fn(async () => new Response('{}'))
    const route = withApiMiddleware(
      {
        routeId: 'test.body',
        allowedMethods: ['POST'],
        timeoutMs: 1000,
        bodyLimitBytes: 4,
      },
      handler,
    )

    const response = await route.fetch(new Request('http://localhost/api/test', {
      method: 'POST',
      body: 'oversized',
    }))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'payloadTooLarge',
        requestId: expect.any(String),
      },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('enforces in-memory rate limits outside production', async () => {
    const route = withApiMiddleware(
      {
        routeId: 'test.rate',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
        rateLimit: {
          limit: 1,
          windowSeconds: 60,
          scope: 'ip',
        },
      },
      async () => new Response('{}'),
    )

    expect((await route.fetch(new Request('http://localhost/api/test'))).status).toBe(200)
    expect((await route.fetch(new Request('http://localhost/api/test'))).status).toBe(429)
  })

  it('enforces timeout envelopes', async () => {
    vi.useFakeTimers()
    const route = withApiMiddleware(
      {
        routeId: 'test.timeout',
        allowedMethods: ['GET'],
        timeoutMs: 10,
      },
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response('{}')), 100)
        }),
    )

    const responsePromise = route.fetch(new Request('http://localhost/api/test'))
    await vi.advanceTimersByTimeAsync(11)
    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'requestTimedOut',
        requestId: expect.any(String),
      },
    })
  })

  it('authenticates before user-scoped rate limits', async () => {
    const route = withApiMiddleware(
      {
        routeId: 'test.auth_rate',
        allowedMethods: ['GET'],
        timeoutMs: 1000,
        rateLimit: {
          limit: 1,
          windowSeconds: 60,
          scope: 'user',
        },
        authenticate: async () => ({ userId: 'supabase-user-a' }),
      },
      async (_request, context) => new Response(JSON.stringify({ userId: context.userId })),
    )

    const request = new Request('http://localhost/api/test', {
      headers: {
        Authorization: 'Bearer token-that-is-not-the-user-id',
      },
    })
    expect((await route.fetch(request.clone())).status).toBe(200)
    const second = await route.fetch(request.clone())
    expect(second.status).toBe(429)
  })
})

describe('observability smoke', () => {
  beforeEach(() => {
    resetInMemoryRateLimitForTests()
    process.env.OBSERVABILITY_SMOKE_SECRET = 'secret'
    process.env.OBSERVABILITY_SMOKE_TEST_EVENT_ID = 'event-123'
  })

  afterEach(() => {
    delete process.env.OBSERVABILITY_SMOKE_SECRET
    delete process.env.OBSERVABILITY_SMOKE_TEST_EVENT_ID
    delete process.env.OBSERVABILITY_SMOKE_URL
    delete process.env.PRODUCTION_RELEASE_REQUIRED
    delete process.env.OBSERVABILITY_SMOKE_DISABLED
  })

  it('rejects smoke calls without the configured secret', async () => {
    const response = await observabilitySmokeRoute.fetch(new Request('http://localhost/api/observability/smoke', {
      method: 'POST',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'observabilitySmokeUnauthorized',
        requestId: expect.any(String),
      },
    })
  })

  it('returns a Sentry event ID for authorized smoke calls', async () => {
    const response = await observabilitySmokeRoute.fetch(new Request('http://localhost/api/observability/smoke', {
      method: 'POST',
      headers: {
        'X-Observability-Smoke-Secret': 'secret',
      },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      eventId: 'event-123',
    })
  })

  it('blocks disabled smoke in production-required mode', async () => {
    const result = await runSentrySmoke({
      PRODUCTION_RELEASE_REQUIRED: 'true',
      OBSERVABILITY_SMOKE_DISABLED: 'true',
    } as NodeJS.ProcessEnv)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('OBSERVABILITY_SMOKE_DISABLED cannot be true when PRODUCTION_RELEASE_REQUIRED=true.')
  })
})

describe('Supabase RLS migration', () => {
  it('enables RLS, user policies, constraints, and hardened function search paths', () => {
    const sql = readFileSync('supabase/migrations/20260428130000_sync_rls_constraints.sql', 'utf8')

    expect(sql).toContain('enable row level security')
    expect(sql).toContain('auth.uid() = user_id')
    expect(sql).toContain('constraint sync_records_scope_known')
    expect(sql).toContain("jsonb_typeof(payload_json) = 'object'")
    expect(sql).toContain("status in ('applied', 'dead_letter')")
    expect(sql).toContain('set search_path = public')
  })
})
