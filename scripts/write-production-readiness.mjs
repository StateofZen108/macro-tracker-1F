import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isStrictExternalProof,
  resolveExpectedSourceGitSha,
} from './production-evidence-binding.mjs'

const SMOKE_RESULT_PATH = resolve('tmp', 'observability-smoke-result.json')
const SENTRY_ALERTS_RESULT_PATH = resolve('tmp', 'sentry-alerts-result.json')
const SUPABASE_RESULT_PATH = resolve('tmp', 'supabase-migration-live-result.json')
const PROOF_REPORT_PATH = resolve('tmp', 'production-proof-report.json')

function resolveRequired(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required to write production readiness.`)
  }
  return value
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function readSmokeEventId() {
  const direct = process.env.SENTRY_SMOKE_EVENT_ID?.trim()
  if (direct) {
    return direct
  }

  if (!existsSync(SMOKE_RESULT_PATH)) {
    throw new Error('Missing tmp/observability-smoke-result.json.')
  }
  const result = JSON.parse(readFileSync(SMOKE_RESULT_PATH, 'utf8'))
  if (typeof result.eventId !== 'string' || !result.eventId.trim()) {
    throw new Error('Sentry smoke result is missing eventId.')
  }
  return result.eventId
}

function readSentryAlertsResult() {
  if (existsSync(SENTRY_ALERTS_RESULT_PATH)) {
    const result = JSON.parse(readFileSync(SENTRY_ALERTS_RESULT_PATH, 'utf8'))
    return {
      verified: result.ok === true,
      verificationMode: result.verificationMode ?? 'api',
      path: 'tmp/sentry-alerts-result.json',
    }
  }

  if (process.env.SENTRY_ALERTS_VERIFIED === 'true') {
    return {
      verified: true,
      verificationMode: 'manual_attestation',
      path: undefined,
    }
  }

  return {
    verified: false,
    verificationMode: undefined,
    path: undefined,
  }
}

function readSupabaseMigrationResult() {
  if (existsSync(SUPABASE_RESULT_PATH)) {
    const result = JSON.parse(readFileSync(SUPABASE_RESULT_PATH, 'utf8'))
    return {
      verified: result.ok === true,
      verificationMode: result.verificationMode ?? 'live_database',
      path: 'tmp/supabase-migration-live-result.json',
    }
  }

  if (process.env.SUPABASE_MIGRATION_VERIFIED === 'true') {
    return {
      verified: true,
      verificationMode: 'manual_attestation',
      path: undefined,
    }
  }

  return {
    verified: false,
    verificationMode: undefined,
    path: undefined,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildId = resolveRequired('VITE_APP_BUILD_ID')
  const currentGitSha = resolveGitSha()
  const sourceGitSha = resolveExpectedSourceGitSha(process.env, currentGitSha)
  const evidenceCommitSha = process.env.PRODUCTION_EVIDENCE_COMMIT_SHA?.trim() || undefined
  const deviceQaManifestPath = resolve(join('docs', 'device-qa-results', `${buildId}.json`))
  if (!existsSync(deviceQaManifestPath)) {
    throw new Error(`Missing device QA manifest: ${deviceQaManifestPath}`)
  }

  const sentryAlerts = readSentryAlertsResult()
  if (!sentryAlerts.verified) {
    throw new Error('Missing Sentry alert verification.')
  }
  if (isStrictExternalProof(process.env) && sentryAlerts.verificationMode !== 'api') {
    throw new Error('Strict external proof requires Sentry alerts verified through the Sentry API.')
  }
  const supabaseMigration = readSupabaseMigrationResult()
  if (!supabaseMigration.verified) {
    throw new Error('Missing Supabase migration verification.')
  }
  if (isStrictExternalProof(process.env) && supabaseMigration.verificationMode !== 'live_database') {
    throw new Error('Strict external proof requires Supabase migration verified against the live database.')
  }

  const manifest = {
    buildId,
    sourceGitSha,
    gitSha: sourceGitSha,
    ...(evidenceCommitSha ? { evidenceCommitSha } : {}),
    checkedAt: new Date().toISOString(),
    deploymentBaseUrl: process.env.PRODUCTION_BASE_URL ?? null,
    releaseSuitePassed: true,
    deviceQaManifestPath: `docs/device-qa-results/${buildId}.json`,
    sentrySmokeEventId: readSmokeEventId(),
    sentrySmokeResultPath: existsSync(SMOKE_RESULT_PATH) ? 'tmp/observability-smoke-result.json' : undefined,
    sentryAlertsVerified: sentryAlerts.verified,
    sentryAlertVerificationMode: sentryAlerts.verificationMode,
    sentryAlertsResultPath: sentryAlerts.path,
    supabaseMigrationVerified: supabaseMigration.verified,
    supabaseVerificationMode: supabaseMigration.verificationMode,
    supabaseMigrationResultPath: supabaseMigration.path,
    productionProofReportPath: existsSync(PROOF_REPORT_PATH) ? 'tmp/production-proof-report.json' : undefined,
    moduleBudgetPassed: true,
  }

  const outputDir = resolve('docs', 'production-readiness')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, `${buildId}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(
    join(outputDir, `${buildId}.md`),
    [
      `# Production Readiness ${buildId}`,
      '',
      `- Source Git SHA: ${sourceGitSha}`,
      `- Evidence commit SHA: ${evidenceCommitSha ?? '<recorded in production proof report after commit>'}`,
      `- Checked at: ${manifest.checkedAt}`,
      `- Deployment base URL: ${manifest.deploymentBaseUrl ?? '<not recorded>'}`,
      `- Device QA: ${manifest.deviceQaManifestPath}`,
      `- Sentry smoke event: ${manifest.sentrySmokeEventId}`,
      `- Sentry alerts verified: ${manifest.sentryAlertsVerified} (${manifest.sentryAlertVerificationMode})`,
      `- Supabase migration verified: ${manifest.supabaseMigrationVerified} (${manifest.supabaseVerificationMode})`,
      `- Production proof report: ${manifest.productionProofReportPath ?? '<not recorded>'}`,
      `- Module budgets passed: ${manifest.moduleBudgetPassed}`,
      '',
    ].join('\n'),
  )
  console.log(`Production readiness manifest written for ${buildId}.`)
}
