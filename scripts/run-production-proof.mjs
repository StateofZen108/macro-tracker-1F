import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  findReleaseHygieneViolations,
  isIgnoredReleaseArtifact,
  parsePorcelainStatus,
} from './check-release-hygiene.mjs'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const REPORT_PATH = resolve('tmp', 'production-proof-report.json')

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function isNonLocalBuildId(buildId) {
  return typeof buildId === 'string' &&
    buildId.trim().length > 0 &&
    !buildId.startsWith('local-') &&
    !buildId.startsWith('local-release-')
}

export function deriveSmokeUrl(env = process.env) {
  if (env.OBSERVABILITY_SMOKE_URL?.trim()) {
    return env.OBSERVABILITY_SMOKE_URL.trim()
  }
  const baseUrl = env.PRODUCTION_BASE_URL?.trim()
  if (!baseUrl) {
    return null
  }
  return `${baseUrl.replace(/\/+$/, '')}/api/observability/smoke`
}

function assertHttpsProductionUrl(value) {
  if (!value) {
    return 'PRODUCTION_BASE_URL is required.'
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return 'PRODUCTION_BASE_URL must be a valid URL.'
  }
  if (parsed.protocol !== 'https:') {
    return 'PRODUCTION_BASE_URL must be HTTPS.'
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    return 'PRODUCTION_BASE_URL cannot point at a local host.'
  }
  return null
}

function readGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function readGitStatus() {
  return execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

export function validateProductionProofPreflight({ env = process.env, gitStatus = '', gitSha = 'unknown' } = {}) {
  const errors = []
  const buildId = env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  if (!isNonLocalBuildId(buildId)) {
    errors.push('Production proof requires a non-local VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
  }

  const baseUrlError = assertHttpsProductionUrl(env.PRODUCTION_BASE_URL)
  if (baseUrlError) {
    errors.push(baseUrlError)
  }

  const hygieneViolations = findReleaseHygieneViolations(parsePorcelainStatus(gitStatus), {
    ...env,
    VITE_APP_BUILD_ID: buildId || env.VITE_APP_BUILD_ID,
    GIT_COMMIT_SHA: env.GIT_COMMIT_SHA || gitSha,
  })
  if (hygieneViolations.length) {
    errors.push(...hygieneViolations)
  }

  return {
    ok: errors.length === 0,
    buildId,
    gitSha,
    deploymentBaseUrl: env.PRODUCTION_BASE_URL ?? '',
    smokeUrl: deriveSmokeUrl(env),
    errors,
  }
}

export function resolveProductionProofPlan({ mode = 'test', env = process.env } = {}) {
  const deviceMode = env.DEVICE_QA_MODE || 'auto_android'
  const rails = [
    { id: 'local_release_suite', script: 'test:release' },
    { id: 'sentry_smoke', script: 'test:observability:smoke' },
    { id: 'sentry_alerts', script: 'test:sentry:alerts' },
    { id: 'supabase_live_migration', script: 'test:supabase:rls-live' },
  ]

  if (mode === 'commit') {
    if (deviceMode === 'browserstack') {
      rails.push({ id: 'browserstack_device_qa', script: 'test:device-qa:browserstack' })
      rails.push({ id: 'write_device_qa_manifest', script: 'write:device-qa:manifest' })
    } else if (deviceMode === 'manifest_only') {
      if (env.DEVICE_QA_RESULT_SOURCE || env.DEVICE_QA_OPERATOR_EVIDENCE_JSON) {
        rails.push({ id: 'write_device_qa_manifest', script: 'write:device-qa:manifest' })
      }
    } else {
      rails.push({ id: 'android_device_qa', script: 'test:device-qa:auto-android' })
      rails.push({ id: 'write_device_qa_manifest', script: 'write:device-qa:manifest' })
    }
  }

  rails.push({ id: 'device_qa_evidence', script: 'test:device-qa:evidence' })
  rails.push({ id: 'module_budgets', script: 'test:module-budgets' })

  if (mode === 'commit') {
    rails.push({ id: 'write_production_readiness', script: 'write:production-readiness' })
  } else {
    rails.push({ id: 'production_readiness', script: 'test:production-readiness' })
  }

  if (mode !== 'commit') {
    rails.push({ id: 'strict_production_release', script: 'test:release:production' })
  }
  return rails
}

function runNpmScript(scriptName, env) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', npmCommand, 'run', scriptName]
        : ['run', scriptName]
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    })
    child.on('exit', (code) => resolve(typeof code === 'number' ? code : 1))
    child.on('error', () => resolve(1))
  })
}

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
}

function generatedEvidenceFiles(buildId, mode) {
  const files = [
    join('docs', 'device-qa-results', `${buildId}.json`),
    join('docs', 'production-readiness', `${buildId}.json`),
    join('docs', 'production-readiness', `${buildId}.md`),
  ]
  if (mode !== 'commit') {
    return files.filter((path) => existsSync(path))
  }
  return files
}

function stageAndCommitEvidence(buildId) {
  const files = generatedEvidenceFiles(buildId, 'commit')
  const missing = files.filter((path) => !existsSync(path))
  if (missing.length) {
    throw new Error(`Cannot commit production proof; missing generated evidence:\n- ${missing.join('\n- ')}`)
  }

  execFileSync('git', ['add', '--', ...files], { stdio: 'inherit' })
  const status = readGitStatus()
  const unrelated = parsePorcelainStatus(status).filter((entry) => {
    const normalized = entry.path.replace(/\\/g, '/')
    return !files.map((file) => file.replace(/\\/g, '/')).includes(normalized) &&
      !isIgnoredReleaseArtifact(normalized)
  })
  if (unrelated.length) {
    throw new Error(`Cannot commit production proof with unrelated dirty files:\n- ${unrelated.map((entry) => entry.path).join('\n- ')}`)
  }

  execFileSync('git', ['commit', '-m', `chore(release): add production proof for ${buildId}`], {
    stdio: 'inherit',
  })
  return readGitSha()
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export async function runProductionProof({ mode = 'test', env = process.env } = {}) {
  const gitSha = readGitSha()
  const preflight = validateProductionProofPreflight({
    env,
    gitStatus: readGitStatus(),
    gitSha,
  })
  const report = {
    buildId: preflight.buildId ?? '',
    gitSha,
    checkedAt: new Date().toISOString(),
    deploymentBaseUrl: preflight.deploymentBaseUrl,
    status: 'proof_failed',
    rails: [],
    generatedFiles: [],
  }

  const proofEnv = {
    ...env,
    VITE_APP_BUILD_ID: preflight.buildId ?? env.VITE_APP_BUILD_ID,
    GIT_COMMIT_SHA: env.GIT_COMMIT_SHA || gitSha,
    OBSERVABILITY_SMOKE_URL: preflight.smokeUrl ?? env.OBSERVABILITY_SMOKE_URL,
    PRODUCTION_RELEASE_REQUIRED: 'true',
    RELEASE_DEVICE_QA_REQUIRED: 'true',
  }

  if (!preflight.ok) {
    report.rails = preflight.errors.map((reason) => ({
      id: 'preflight',
      status: 'failed',
      reason,
    }))
    writeReport(report)
    return { ok: false, report }
  }

  for (const rail of resolveProductionProofPlan({ mode, env: proofEnv })) {
    const code = await runNpmScript(rail.script, proofEnv)
    const evidence = rail.id === 'sentry_smoke'
      ? 'tmp/observability-smoke-result.json'
      : rail.id === 'sentry_alerts'
        ? 'tmp/sentry-alerts-result.json'
        : rail.id === 'supabase_live_migration'
          ? 'tmp/supabase-migration-live-result.json'
          : undefined
    report.rails.push({
      id: rail.id,
      status: code === 0 ? 'passed' : 'failed',
      evidence,
      reason: code === 0 ? undefined : `${rail.script} exited ${code}.`,
    })
    writeReport(report)
    if (code !== 0) {
      return { ok: false, report }
    }
  }

  report.generatedFiles = generatedEvidenceFiles(preflight.buildId, mode)

  if (mode === 'commit') {
    if (!truthy(proofEnv.PRODUCTION_PROOF_AUTO_COMMIT)) {
      report.status = 'proof_failed'
      report.rails.push({
        id: 'evidence_commit',
        status: 'failed',
        reason: 'PRODUCTION_PROOF_AUTO_COMMIT=true is required for --mode=commit.',
      })
      writeReport(report)
      return { ok: false, report }
    }

    try {
      report.commitSha = stageAndCommitEvidence(preflight.buildId)
      report.rails.push({
        id: 'evidence_commit',
        status: 'passed',
        evidence: report.commitSha,
      })
    } catch (error) {
      report.rails.push({
        id: 'evidence_commit',
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      })
      writeReport(report)
      return { ok: false, report }
    }

    const strictCode = await runNpmScript('test:release:production', {
      ...proofEnv,
      GIT_COMMIT_SHA: report.commitSha,
    })
    report.rails.push({
      id: 'strict_production_release_after_commit',
      status: strictCode === 0 ? 'passed' : 'failed',
      reason: strictCode === 0 ? undefined : `test:release:production exited ${strictCode}.`,
    })
    if (strictCode !== 0) {
      writeReport(report)
      return { ok: false, report }
    }
  }

  const smoke = readJsonIfExists(resolve('tmp', 'observability-smoke-result.json'))
  if (smoke?.eventId) {
    const smokeRail = report.rails.find((rail) => rail.id === 'sentry_smoke')
    if (smokeRail) {
      smokeRail.evidence = `tmp/observability-smoke-result.json#${smoke.eventId}`
    }
  }

  report.status = 'proof_green'
  writeReport(report)
  return { ok: true, report }
}

function parseMode(argv) {
  const modeArg = argv.find((arg) => arg.startsWith('--mode='))
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'test'
  return mode === 'commit' ? 'commit' : 'test'
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = parseMode(process.argv.slice(2))
  const result = await runProductionProof({ mode })
  if (!result.ok) {
    console.error('Production proof failed:')
    for (const rail of result.report.rails.filter((candidate) => candidate.status === 'failed')) {
      console.error(`- ${rail.id}: ${rail.reason ?? 'failed'}`)
    }
    console.error(`Proof report written to ${REPORT_PATH}.`)
    process.exit(1)
  }

  console.log(`Production proof green for ${result.report.buildId}.`)
}
