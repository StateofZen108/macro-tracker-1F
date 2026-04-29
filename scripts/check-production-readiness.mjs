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

function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function isGitTracked(path) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
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

  if (expected.requireDeploymentBaseUrl && (typeof manifest.deploymentBaseUrl !== 'string' || !manifest.deploymentBaseUrl.startsWith('https://'))) {
    violations.push('Readiness manifest requires an HTTPS deploymentBaseUrl.')
  }
  if (expected.requireProofReport && (typeof manifest.productionProofReportPath !== 'string' || !manifest.productionProofReportPath.trim())) {
    violations.push('Readiness manifest requires productionProofReportPath in strict production mode.')
  }

  if (
    manifest.sentryAlertVerificationMode !== undefined &&
    manifest.sentryAlertVerificationMode !== 'api' &&
    manifest.sentryAlertVerificationMode !== 'manual_attestation'
  ) {
    violations.push('Readiness manifest sentryAlertVerificationMode must be api or manual_attestation.')
  }

  if (
    manifest.supabaseVerificationMode !== undefined &&
    manifest.supabaseVerificationMode !== 'live_database' &&
    manifest.supabaseVerificationMode !== 'manual_attestation'
  ) {
    violations.push('Readiness manifest supabaseVerificationMode must be live_database or manual_attestation.')
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

  if (expected.requireExistingPaths) {
    for (const field of [
      'deviceQaManifestPath',
      'sentrySmokeResultPath',
      'sentryAlertsResultPath',
      'supabaseMigrationResultPath',
      'productionProofReportPath',
    ]) {
      const path = manifest[field]
      if (typeof path === 'string' && path.trim() && !existsSync(resolve(path))) {
        violations.push(`Readiness manifest references missing evidence path: ${path}`)
      }
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
  const strictProduction = isTruthy(process.env.PRODUCTION_RELEASE_REQUIRED)
  const violations = validateProductionReadinessManifest(manifest, {
    buildId,
    gitSha,
    requireExistingPaths: true,
    requireDeploymentBaseUrl: strictProduction,
    requireProofReport: strictProduction,
  })
  if (strictProduction && !isGitTracked(join('docs', 'production-readiness', `${buildId}.json`))) {
    violations.push(`Readiness manifest must be committed in strict production mode: docs/production-readiness/${buildId}.json`)
  }
  if (violations.length) {
    console.error('Production readiness check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Production readiness verified.')
}
