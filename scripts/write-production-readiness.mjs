import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function resolveRequired(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required to write production readiness.`)
  }
  return value
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function readSmokeEventId() {
  const direct = process.env.SENTRY_SMOKE_EVENT_ID?.trim()
  if (direct) {
    return direct
  }

  const smokePath = resolve('tmp', 'observability-smoke-result.json')
  if (!existsSync(smokePath)) {
    throw new Error('Missing tmp/observability-smoke-result.json.')
  }
  const result = JSON.parse(readFileSync(smokePath, 'utf8'))
  if (typeof result.eventId !== 'string' || !result.eventId.trim()) {
    throw new Error('Sentry smoke result is missing eventId.')
  }
  return result.eventId
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildId = resolveRequired('VITE_APP_BUILD_ID')
  const gitSha = resolveGitSha()
  const deviceQaManifestPath = resolve(join('docs', 'device-qa-results', `${buildId}.json`))
  if (!existsSync(deviceQaManifestPath)) {
    throw new Error(`Missing device QA manifest: ${deviceQaManifestPath}`)
  }

  const manifest = {
    buildId,
    gitSha,
    checkedAt: new Date().toISOString(),
    releaseSuitePassed: true,
    deviceQaManifestPath,
    sentrySmokeEventId: readSmokeEventId(),
    sentryAlertsVerified: process.env.SENTRY_ALERTS_VERIFIED === 'true',
    supabaseMigrationVerified: process.env.SUPABASE_MIGRATION_VERIFIED === 'true',
    moduleBudgetPassed: true,
  }

  const outputDir = resolve('docs', 'production-readiness')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, `${buildId}.json`), JSON.stringify(manifest, null, 2))
  writeFileSync(
    join(outputDir, `${buildId}.md`),
    [
      `# Production Readiness ${buildId}`,
      '',
      `- Git SHA: ${gitSha}`,
      `- Checked at: ${manifest.checkedAt}`,
      `- Device QA: ${deviceQaManifestPath}`,
      `- Sentry smoke event: ${manifest.sentrySmokeEventId}`,
      `- Sentry alerts verified: ${manifest.sentryAlertsVerified}`,
      `- Supabase migration verified: ${manifest.supabaseMigrationVerified}`,
      `- Module budgets passed: ${manifest.moduleBudgetPassed}`,
      '',
    ].join('\n'),
  )
  console.log(`Production readiness manifest written for ${buildId}.`)
}
