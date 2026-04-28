import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { withApiMiddleware } from '../../server/http/apiMiddleware'
import { resetInMemoryRateLimitForTests } from '../../server/http/rateLimit'
import { redactSentryEvent as redactServerSentryEvent } from '../../server/observability/sentry.server'
import { redactClientSentryEvent } from '../../src/observability/sentry.client'
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

