import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isStrictExternalProof,
  shaMatches,
} from './production-evidence-binding.mjs'

const RESULT_PATH = resolve('tmp', 'observability-smoke-result.json')

function truthy(value) {
  return typeof value === 'string' && ['true', '1', 'on'].includes(value.trim().toLowerCase())
}

function resolveGitSha(env) {
  if (env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA) {
    return env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

export async function runSentrySmoke(env = process.env, fetchImpl = fetch) {
  const productionRequired = truthy(env.PRODUCTION_RELEASE_REQUIRED)
  const buildId = env.VITE_APP_BUILD_ID ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? null
  const deploymentBaseUrl = env.PRODUCTION_BASE_URL ?? null
  const gitSha = resolveGitSha(env)
  const expectedSourceGitSha = env.PRODUCTION_SOURCE_GIT_SHA ?? gitSha
  const strictExternalProof = isStrictExternalProof(env)
  const checkedAt = new Date().toISOString()

  if (truthy(env.OBSERVABILITY_SMOKE_DISABLED)) {
    if (productionRequired) {
      return {
        ok: false,
        checkedAt,
        buildId,
        gitSha,
        deploymentBaseUrl,
        errors: ['OBSERVABILITY_SMOKE_DISABLED cannot be true when PRODUCTION_RELEASE_REQUIRED=true.'],
      }
    }
    return {
      ok: true,
      skipped: true,
      eventId: 'smoke-disabled-outside-production',
      checkedAt,
      buildId,
      gitSha,
      deploymentBaseUrl,
    }
  }

  const url = env.OBSERVABILITY_SMOKE_URL?.trim()
  const secret = env.OBSERVABILITY_SMOKE_SECRET?.trim()
  if (!url || !secret) {
    return {
      ok: false,
      checkedAt,
      buildId,
      gitSha,
      deploymentBaseUrl,
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
      buildId,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.eventId) {
    return {
      ok: false,
      checkedAt,
      buildId,
      gitSha,
      deploymentBaseUrl,
      errors: [`Sentry smoke failed with status ${response.status}; missing event ID.`],
    }
  }
  const proofErrors = []
  if (strictExternalProof && payload.buildId !== buildId) {
    proofErrors.push(`Sentry smoke buildId mismatch: expected ${buildId}, got ${payload.buildId ?? '<missing>'}.`)
  }
  if (strictExternalProof && (!payload.gitSha || !shaMatches(payload.gitSha, expectedSourceGitSha))) {
    proofErrors.push(`Sentry smoke sourceGitSha mismatch: expected ${expectedSourceGitSha}, got ${payload.gitSha ?? '<missing>'}.`)
  }
  if (proofErrors.length) {
    return {
      ok: false,
      checkedAt,
      buildId,
      gitSha: expectedSourceGitSha,
      deploymentBaseUrl,
      returnedBuildId: payload.buildId ?? null,
      returnedGitSha: payload.gitSha ?? null,
      errors: proofErrors,
    }
  }

  return {
    ok: true,
    eventId: String(payload.eventId),
    checkedAt,
    buildId,
    gitSha: expectedSourceGitSha,
    deploymentBaseUrl,
    smokeUrl: url,
    returnedBuildId: payload.buildId ?? null,
    returnedGitSha: payload.gitSha ?? null,
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
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
  console.log(result.skipped ? 'Sentry smoke skipped outside production.' : `Sentry smoke verified: ${result.eventId}`)
}
