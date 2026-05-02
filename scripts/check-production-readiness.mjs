import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isStrictExternalProof,
  isTruthy,
  resolveExpectedSourceGitSha,
  validateEvidenceBinding,
} from './production-evidence-binding.mjs'

function resolveBuildId(env = process.env) {
  return env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || null
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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

  violations.push(...validateEvidenceBinding(manifest, expected, 'Readiness'))

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
  if (expected.strictExternalProof && manifest.sentryAlertVerificationMode !== 'api') {
    violations.push('Readiness manifest requires sentryAlertVerificationMode=api in strict external proof mode.')
  }

  if (
    manifest.supabaseVerificationMode !== undefined &&
    manifest.supabaseVerificationMode !== 'live_database' &&
    manifest.supabaseVerificationMode !== 'manual_attestation'
  ) {
    violations.push('Readiness manifest supabaseVerificationMode must be live_database or manual_attestation.')
  }
  if (expected.strictExternalProof && manifest.supabaseVerificationMode !== 'live_database') {
    violations.push('Readiness manifest requires supabaseVerificationMode=live_database in strict external proof mode.')
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

  const currentGitSha = resolveGitSha()
  const manifestPath = resolve(join('docs', 'production-readiness', `${buildId}.json`))
  if (!existsSync(manifestPath)) {
    console.error('Production readiness check failed:')
    console.error(`- Missing production readiness manifest: ${manifestPath}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const strictProduction = isTruthy(process.env.PRODUCTION_RELEASE_REQUIRED)
  const strictExternalProof = isStrictExternalProof(process.env)
  const sourceGitSha = resolveExpectedSourceGitSha(process.env, strictProduction ? null : currentGitSha)
  const violations = []
  if (strictProduction && !process.env.PRODUCTION_SOURCE_GIT_SHA?.trim()) {
    violations.push('PRODUCTION_SOURCE_GIT_SHA is required in strict production mode.')
  }
  violations.push(...validateProductionReadinessManifest(manifest, {
    buildId,
    sourceGitSha,
    gitSha: sourceGitSha,
    evidenceCommitSha: currentGitSha,
    requireExistingPaths: true,
    requireDeploymentBaseUrl: strictProduction,
    requireProofReport: strictProduction,
    strictExternalProof,
  }))
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
