import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function resolveBuildId(env = process.env) {
  return env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || null
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function validateProductionReadinessManifest(manifest, expected) {
  const violations = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Production readiness manifest must be a JSON object.']
  }

  if (manifest.buildId !== expected.buildId) {
    violations.push(`Readiness buildId mismatch: expected ${expected.buildId}, got ${manifest.buildId ?? '<missing>'}.`)
  }
  if (manifest.gitSha !== expected.gitSha) {
    violations.push(`Readiness gitSha mismatch: expected ${expected.gitSha}, got ${manifest.gitSha ?? '<missing>'}.`)
  }

  for (const field of ['checkedAt', 'deviceQaManifestPath', 'sentrySmokeEventId']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      violations.push(`Readiness manifest missing ${field}.`)
    }
  }

  for (const field of [
    'releaseSuitePassed',
    'sentryAlertsVerified',
    'supabaseMigrationVerified',
    'moduleBudgetPassed',
  ]) {
    if (manifest[field] !== true) {
      violations.push(`Readiness manifest requires ${field}=true.`)
    }
  }

  return violations
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildId = resolveBuildId()
  if (!buildId) {
    console.error('Production readiness check failed:')
    console.error('- Missing VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
    process.exit(1)
  }

  const gitSha = resolveGitSha()
  const manifestPath = resolve(join('docs', 'production-readiness', `${buildId}.json`))
  if (!existsSync(manifestPath)) {
    console.error('Production readiness check failed:')
    console.error(`- Missing production readiness manifest: ${manifestPath}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const violations = validateProductionReadinessManifest(manifest, { buildId, gitSha })
  if (violations.length) {
    console.error('Production readiness check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Production readiness verified.')
}
