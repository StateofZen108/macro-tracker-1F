import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canRunSupabaseLiveCheck } from './check-supabase-migration-live.mjs'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const REPORT_PATH = resolve('tmp', 'production-rails-accessible-report.json')

function truthy(value) {
  return typeof value === 'string' && ['true', '1', 'on'].includes(value.trim().toLowerCase())
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.status === 0
}

export function resolveAccessibleBuildId(env = process.env, gitSha = resolveGitSha()) {
  return env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || `local-accessible-${gitSha}`
}

export function resolveAccessibleProductionRailsPlan({
  env = process.env,
  exists = existsSync,
  commandExistsImpl = commandExists,
  gitSha = resolveGitSha(),
} = {}) {
  const buildId = resolveAccessibleBuildId(env, gitSha)
  const deviceManifestPath = resolve(join('docs', 'device-qa-results', `${buildId}.json`))
  const readinessManifestPath = resolve(join('docs', 'production-readiness', `${buildId}.json`))
  const sentryConfigured = Boolean(env.OBSERVABILITY_SMOKE_URL?.trim() && env.OBSERVABILITY_SMOKE_SECRET?.trim())
  const supabaseLiveAvailable = canRunSupabaseLiveCheck(env, commandExistsImpl)
  const deviceManifestPresent = exists(deviceManifestPath)
  const readinessManifestPresent = exists(readinessManifestPath)

  const rails = [
    {
      id: 'local_release_suite',
      command: 'test:release',
      required: true,
      env: {
        VITE_APP_BUILD_ID: buildId,
        PRODUCTION_RELEASE_REQUIRED: 'false',
        RELEASE_DEVICE_QA_REQUIRED: 'false',
      },
    },
  ]

  const pending = []

  if (sentryConfigured) {
    rails.push({
      id: 'sentry_smoke',
      command: 'test:observability:smoke',
      required: false,
      env: {
        VITE_APP_BUILD_ID: buildId,
      },
    })
  } else {
    pending.push({
      id: 'sentry_smoke',
      reason: 'OBSERVABILITY_SMOKE_URL and OBSERVABILITY_SMOKE_SECRET are not configured.',
    })
  }

  if (supabaseLiveAvailable) {
    rails.push({
      id: 'supabase_live_migration',
      command: 'test:supabase:rls-live',
      required: false,
      env: {
        VITE_APP_BUILD_ID: buildId,
      },
    })
  } else {
    pending.push({
      id: 'supabase_live_migration',
      reason: 'SUPABASE_DB_URL or DATABASE_URL plus psql on PATH are required for live RLS verification.',
    })
  }

  if (deviceManifestPresent) {
    rails.push({
      id: 'device_qa_evidence',
      command: 'test:device-qa:evidence',
      required: false,
      env: {
        VITE_APP_BUILD_ID: buildId,
        RELEASE_DEVICE_QA_REQUIRED: 'true',
      },
    })
  } else {
    pending.push({
      id: 'device_qa_evidence',
      reason: `Missing physical-device manifest: ${deviceManifestPath}`,
    })
  }

  if (readinessManifestPresent) {
    rails.push({
      id: 'production_readiness_manifest',
      command: 'test:production-readiness',
      required: false,
      env: {
        VITE_APP_BUILD_ID: buildId,
      },
    })
  } else {
    pending.push({
      id: 'production_readiness_manifest',
      reason: `Missing committed readiness manifest: ${readinessManifestPath}`,
    })
  }

  if (sentryConfigured && deviceManifestPresent && readinessManifestPresent) {
    rails.push({
      id: 'strict_production_release',
      command: 'test:release:production',
      required: false,
      env: {
        VITE_APP_BUILD_ID: buildId,
        PRODUCTION_RELEASE_REQUIRED: 'true',
        RELEASE_DEVICE_QA_REQUIRED: 'true',
      },
    })
  } else {
    pending.push({
      id: 'strict_production_release',
      reason: 'Strict production release waits for Sentry smoke credentials, physical-device evidence, and production readiness manifest.',
    })
  }

  return {
    buildId,
    gitSha,
    rails,
    pending,
  }
}

function runNpmScript(scriptName, env) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', npmCommand, 'run', scriptName]
        : ['run', scriptName]
    const startedAt = Date.now()
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      resolve({
        command: scriptName,
        status: code === 0 ? 'passed' : 'failed',
        exitCode: typeof code === 'number' ? code : 1,
        durationMs: Date.now() - startedAt,
      })
    })
    child.on('error', (error) => {
      console.error(error.message)
      resolve({
        command: scriptName,
        status: 'failed',
        exitCode: 1,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

function buildRailEnv(baseEnv, buildId, railEnv) {
  return Object.fromEntries(
    Object.entries({
      ...baseEnv,
      ...railEnv,
      VITE_APP_BUILD_ID: railEnv.VITE_APP_BUILD_ID ?? buildId,
    }).filter(([key, value]) => key && !key.startsWith('=') && typeof value === 'string'),
  )
}

export async function runAccessibleProductionRails({
  env = process.env,
  exists = existsSync,
  commandExistsImpl = commandExists,
} = {}) {
  const plan = resolveAccessibleProductionRailsPlan({ env, exists, commandExistsImpl })
  const results = []
  let failed = false

  console.log(`Accessible production rails build id: ${plan.buildId}`)
  for (const rail of plan.rails) {
    console.log(`\n--- ${rail.id}: npm run ${rail.command} ---`)
    const result = await runNpmScript(rail.command, buildRailEnv(env, plan.buildId, rail.env ?? {}))
    results.push({
      id: rail.id,
      ...result,
    })
    if (result.exitCode !== 0) {
      failed = true
      break
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    buildId: plan.buildId,
    gitSha: plan.gitSha,
    status: failed
      ? 'failed'
      : plan.pending.length
        ? 'accessible_green_external_pending'
        : 'production_green',
    rails: results,
    pending: plan.pending,
  }
  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

  if (plan.pending.length) {
    console.log('\nExternal rails still pending:')
    for (const item of plan.pending) {
      console.log(`- ${item.id}: ${item.reason}`)
    }
  }
  console.log(`\nAccessible production rails report: ${REPORT_PATH}`)

  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = await runAccessibleProductionRails()
  if (report.status === 'failed') {
    process.exit(1)
  }
  if (truthy(process.env.PRODUCTION_RAILS_REQUIRE_ALL) && report.pending.length) {
    process.exit(1)
  }
}
