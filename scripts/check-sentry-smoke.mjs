import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RESULT_PATH = resolve('tmp', 'observability-smoke-result.json')

function truthy(value) {
  return typeof value === 'string' && ['true', '1', 'on'].includes(value.trim().toLowerCase())
}

export async function runSentrySmoke(env = process.env, fetchImpl = fetch) {
  const productionRequired = truthy(env.PRODUCTION_RELEASE_REQUIRED)
  if (truthy(env.OBSERVABILITY_SMOKE_DISABLED)) {
    if (productionRequired) {
      return {
        ok: false,
        errors: ['OBSERVABILITY_SMOKE_DISABLED cannot be true when PRODUCTION_RELEASE_REQUIRED=true.'],
      }
    }
    return {
      ok: true,
      skipped: true,
      eventId: 'smoke-disabled-outside-production',
    }
  }

  const url = env.OBSERVABILITY_SMOKE_URL?.trim()
  const secret = env.OBSERVABILITY_SMOKE_SECRET?.trim()
  if (!url || !secret) {
    return {
      ok: false,
      errors: ['OBSERVABILITY_SMOKE_URL and OBSERVABILITY_SMOKE_SECRET are required.'],
    }
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Observability-Smoke-Secret': secret,
    },
    body: JSON.stringify({
      buildId: env.VITE_APP_BUILD_ID ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? null,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.eventId) {
    return {
      ok: false,
      errors: [`Sentry smoke failed with status ${response.status}; missing event ID.`],
    }
  }

  return {
    ok: true,
    eventId: String(payload.eventId),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runSentrySmoke()
  if (!result.ok) {
    console.error('Sentry smoke check failed:')
    for (const error of result.errors ?? ['Unknown Sentry smoke failure.']) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  mkdirSync(dirname(RESULT_PATH), { recursive: true })
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2))
  console.log(result.skipped ? 'Sentry smoke skipped outside production.' : `Sentry smoke verified: ${result.eventId}`)
}
