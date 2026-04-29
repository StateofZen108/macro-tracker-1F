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
import { validateSentryAlertRules, verifySentryAlerts } from '../../scripts/check-sentry-alerts.mjs'
import { resolveAccessibleProductionRailsPlan } from '../../scripts/run-accessible-production-rails.mjs'
import { validateSupabaseMigrationSnapshot } from '../../scripts/check-supabase-migration-live.mjs'
import {
  deriveSmokeUrl,
  isNonLocalBuildId,
  resolveProductionProofPlan,
  validateProductionProofPreflight,
} from '../../scripts/run-production-proof.mjs'
import { buildDeviceQaManifest } from '../../scripts/write-device-qa-manifest.mjs'
import {
  buildBrowserStackCapabilities,
  resolveBrowserStackDeviceQaPlan,
} from '../../scripts/run-device-qa-browserstack.mjs'
import {
  parseAdbDevices,
  resolveAndroidDeviceQaPlan,
} from '../../scripts/run-device-qa-android.mjs'
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
        automationMode: 'operator_assisted',
      })),
    }

    expect(validateDeviceQaEvidence(manifest, { buildId: 'build-1', gitSha: 'abc123' })).toEqual([])
    expect(validateDeviceQaEvidence({ ...manifest, gitSha: 'old' }, { buildId: 'build-1', gitSha: 'abc123' }))
      .toContain('Device QA gitSha mismatch: expected abc123, got old.')
    expect(validateDeviceQaEvidence({
      ...manifest,
      checks: manifest.checks.map((check) => ({ ...check, automationMode: 'simulated' })),
    }, { buildId: 'build-1', gitSha: 'abc123' }))
      .toContain('Device QA check camera_permission_denied requires automationMode automated or operator_assisted.')
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
      sentryAlertVerificationMode: 'api',
      supabaseMigrationVerified: true,
      supabaseVerificationMode: 'live_database',
      moduleBudgetPassed: true,
    }

    expect(validateProductionReadinessManifest(manifest, { buildId: 'build-1', gitSha: 'abc123' })).toEqual([])
    expect(validateProductionReadinessManifest({ ...manifest, moduleBudgetPassed: false }, { buildId: 'build-1', gitSha: 'abc123' }))
      .toContain('Readiness manifest requires moduleBudgetPassed=true.')
  })

  it('enforces public root module budgets', () => {
    expect(findModuleBudgetViolations()).toEqual([])
  })

  it('plans all locally accessible rails while reporting missing external proof', () => {
    const plan = resolveAccessibleProductionRailsPlan({
      env: {},
      exists: () => false,
      commandExistsImpl: () => false,
      gitSha: 'abc123',
    })

    expect(plan.buildId).toBe('local-accessible-abc123')
    expect(plan.rails.map((rail) => rail.id)).toEqual(['local_release_suite'])
    expect(plan.pending.map((item) => item.id)).toEqual([
      'sentry_smoke',
      'supabase_live_migration',
      'device_qa_evidence',
      'production_readiness_manifest',
      'strict_production_release',
    ])
  })

  it('includes external rails when credentials, tools, and manifests are available', () => {
    const plan = resolveAccessibleProductionRailsPlan({
      env: {
        VITE_APP_BUILD_ID: 'build-1',
        OBSERVABILITY_SMOKE_URL: 'https://example.test/api/observability/smoke',
        OBSERVABILITY_SMOKE_SECRET: 'secret',
        SUPABASE_DB_URL: 'postgres://example',
      },
      exists: (path) =>
        path.endsWith('docs\\device-qa-results\\build-1.json') ||
        path.endsWith('docs/device-qa-results/build-1.json') ||
        path.endsWith('docs\\production-readiness\\build-1.json') ||
        path.endsWith('docs/production-readiness/build-1.json'),
      commandExistsImpl: () => true,
      gitSha: 'abc123',
    })

    expect(plan.pending).toEqual([])
    expect(plan.rails.map((rail) => rail.id)).toEqual([
      'local_release_suite',
      'sentry_smoke',
      'supabase_live_migration',
      'device_qa_evidence',
      'production_readiness_manifest',
      'strict_production_release',
    ])
  })

  it('enforces strict production proof preflight and derives the smoke URL', () => {
    expect(isNonLocalBuildId('build-2026-04-29')).toBe(true)
    expect(isNonLocalBuildId('local-release-abc')).toBe(false)
    expect(deriveSmokeUrl({ PRODUCTION_BASE_URL: 'https://app.example.com/' } as NodeJS.ProcessEnv))
      .toBe('https://app.example.com/api/observability/smoke')

    const result = validateProductionProofPreflight({
      env: {
        VITE_APP_BUILD_ID: 'local-release-abc',
        PRODUCTION_BASE_URL: 'http://localhost:4173',
      } as NodeJS.ProcessEnv,
      gitStatus: ' M src/App.tsx',
      gitSha: 'abc123',
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Production proof requires a non-local VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
    expect(result.errors).toContain('PRODUCTION_BASE_URL must be HTTPS.')
    expect(result.errors).toContain('Tracked source change is not committed: src/App.tsx')
  })

  it('builds production proof plans for test and commit modes', () => {
    expect(resolveProductionProofPlan({ mode: 'test', env: {} as NodeJS.ProcessEnv }).map((rail) => rail.id))
      .toContain('strict_production_release')
    expect(resolveProductionProofPlan({ mode: 'commit', env: { DEVICE_QA_MODE: 'browserstack' } as NodeJS.ProcessEnv }).map((rail) => rail.id))
      .toEqual([
        'local_release_suite',
        'sentry_smoke',
        'sentry_alerts',
        'supabase_live_migration',
        'browserstack_device_qa',
        'write_device_qa_manifest',
        'device_qa_evidence',
        'module_budgets',
        'write_production_readiness',
      ])
  })

  it('normalizes device QA evidence and refuses missing hardware proof', () => {
    const manifest = buildDeviceQaManifest({
      checkedAt: '2026-04-29T10:00:00.000Z',
      tester: 'QA',
      checks: REQUIRED_DEVICE_QA_CHECKS.map((id) => ({
        id,
        status: 'passed',
        evidence: `evidence/${id}.png`,
        automationMode: id === 'discard_dialog_hit_test' ? 'automated' : 'operator_assisted',
      })),
    }, { buildId: 'build-1', gitSha: 'abc123' })

    expect(manifest.buildId).toBe('build-1')
    expect(validateDeviceQaEvidence(manifest, { buildId: 'build-1', gitSha: 'abc123' })).toEqual([])
    expect(validateDeviceQaEvidence(buildDeviceQaManifest({ checks: [] }, { buildId: 'build-1', gitSha: 'abc123' }), {
      buildId: 'build-1',
      gitSha: 'abc123',
    })).toContain('Device QA check did not pass: camera_permission_denied')
  })

  it('detects Android and BrowserStack device QA blockers exactly', () => {
    expect(parseAdbDevices('List of devices attached\r\nabc123\tdevice\r\nbad\toffline\r\n'))
      .toEqual([{ serial: 'abc123', state: 'device' }, { serial: 'bad', state: 'offline' }])

    const noAdbPlan = resolveAndroidDeviceQaPlan(
      { VITE_APP_BUILD_ID: 'build-1', PRODUCTION_BASE_URL: 'https://app.example.com' } as NodeJS.ProcessEnv,
      () => false,
    )
    expect(noAdbPlan.ok).toBe(false)
    expect(noAdbPlan.errors).toContain('ADB is required for auto_android device QA.')

    const browserStackPlan = resolveBrowserStackDeviceQaPlan({
      VITE_APP_BUILD_ID: 'build-1',
      PRODUCTION_BASE_URL: 'https://app.example.com',
    } as NodeJS.ProcessEnv)
    expect(browserStackPlan.ok).toBe(false)
    expect(browserStackPlan.errors).toContain('BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are required for BrowserStack device QA.')
    expect(buildBrowserStackCapabilities({ VITE_APP_BUILD_ID: 'build-1' } as NodeJS.ProcessEnv)['bstack:options'].realMobile)
      .toBe('true')
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

  it('verifies Sentry alert rules through API or explicit manual attestation', async () => {
    expect(validateSentryAlertRules([
      { name: 'New issue' },
      { name: 'API 5xx spike' },
      { name: 'OCR failure spike' },
      { name: 'Sync failure spike' },
      { name: 'Release regression' },
    ])).toEqual([])

    expect(validateSentryAlertRules([{ name: 'New issue' }])).toContain('api_5xx_spike')

    await expect(verifySentryAlerts({
      SENTRY_ALERTS_VERIFIED: 'true',
    } as NodeJS.ProcessEnv)).resolves.toMatchObject({
      ok: true,
      verificationMode: 'manual_attestation',
    })

    await expect(verifySentryAlerts({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'org',
      SENTRY_PROJECT: 'project',
    } as NodeJS.ProcessEnv, async () => new Response(JSON.stringify([{ name: 'New issue' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))).resolves.toMatchObject({
      ok: false,
      missingAlertIds: expect.arrayContaining(['api_5xx_spike']),
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

  it('validates a live Supabase RLS and constraint snapshot', () => {
    expect(validateSupabaseMigrationSnapshot({
      rlsTables: [
        { table: 'sync_records', rls: true },
        { table: 'sync_mutations', rls: true },
        { table: 'sync_users', rls: true },
      ],
      policies: [
        {
          policy: 'sync_records_user_isolation',
          qual: 'auth.uid() = user_id',
          withCheck: 'auth.uid() = user_id',
        },
        {
          policy: 'sync_mutations_user_isolation',
          qual: 'auth.uid() = user_id',
          withCheck: 'auth.uid() = user_id',
        },
        {
          policy: 'sync_users_user_isolation',
          qual: 'auth.uid() = user_id',
          withCheck: 'auth.uid() = user_id',
        },
      ],
      constraints: [
        { name: 'sync_records_scope_known' },
        { name: 'sync_records_payload_object' },
        { name: 'sync_records_server_version_positive' },
        { name: 'sync_records_last_device_id_nonempty' },
        { name: 'sync_mutations_status_known' },
      ],
      indexes: [
        'sync_records_user_version_idx',
        'sync_mutations_user_record_idx',
      ],
      functions: [
        { name: 'claim_sync_server_version', config: '{search_path=public}' },
        { name: 'replace_sync_records_for_user', config: '{search_path=public}' },
      ],
    })).toEqual([])

    expect(validateSupabaseMigrationSnapshot({
      rlsTables: [{ table: 'sync_records', rls: false }],
    })).toContain('RLS is not enabled for sync_records.')
  })
})
