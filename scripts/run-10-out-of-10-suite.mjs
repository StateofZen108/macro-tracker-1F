import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
export const TEN_OUT_OF_TEN_REPORT_PATH = resolve('tmp', '10-out-of-10-report.json')
export const TEN_OUT_OF_TEN_TARGET = 'paid_pwa'
export const PAID_PREVIEW_PRESET = 'paid-cut-os-preview'

const TEN_ENV_FLAGS = {
  VITE_APP_FEATURE_PRESET: PAID_PREVIEW_PRESET,
  VITE_FF_MACRO_FACTOR_CORPUS_GATE_V1: 'true',
  VITE_FF_STANDALONE_CUT_NINE_V1: 'true',
  VITE_FF_MACRO_FACTOR_SURPASS_V1: 'true',
  VITE_FF_MISTAKE_PROOF_CUT_V1: 'true',
  VITE_FF_DAILY_GUARDRAILS_V1: 'true',
  VITE_FF_FOOD_TRUST_REPAIR_V1: 'true',
  VITE_FF_COACH_MISTAKE_PROOF_V1: 'true',
  VITE_FF_SURFACE_CONSISTENCY_GUARD_V1: 'true',
  VITE_FF_AI_MEAL_CAPTURE_V1: 'false',
}

const TEN_RAIL_IDS = [
  'daily_loop_unbreakable',
  'food_logging_trust_superior',
  'coach_local_paid_superior',
  'cut_engine_validated',
  'production_operable',
  'physical_device_verified',
  'paid_account_ready',
  'support_recovery_ready',
  'visual_polish_verified',
]

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function resolveBuildId(env = process.env, gitSha = readGitSha()) {
  return (
    env.VITE_APP_BUILD_ID ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GIT_COMMIT_SHA ||
    `local-10-${gitSha.slice(0, 12)}`
  )
}

function cleanEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key, value]) => key && !key.startsWith('=') && typeof value === 'string'),
  )
}

export function buildTenOutOfTenEnv({ env = process.env, mode = 'local', gitSha = readGitSha() } = {}) {
  const buildId = resolveBuildId(env, gitSha)
  const strictProduction = mode === 'production'
  return cleanEnv({
    ...env,
    ...TEN_ENV_FLAGS,
    VITE_APP_BUILD_ID: buildId,
    GIT_COMMIT_SHA: env.GIT_COMMIT_SHA || gitSha,
    PRODUCTION_SOURCE_GIT_SHA: strictProduction ? env.PRODUCTION_SOURCE_GIT_SHA : env.PRODUCTION_SOURCE_GIT_SHA || env.GIT_COMMIT_SHA || gitSha,
    PRODUCTION_RELEASE_REQUIRED: strictProduction ? 'true' : env.PRODUCTION_RELEASE_REQUIRED || 'false',
    PRODUCTION_STRICT_EXTERNAL_PROOF: strictProduction ? 'true' : env.PRODUCTION_STRICT_EXTERNAL_PROOF,
    RELEASE_DEVICE_QA_REQUIRED: strictProduction ? 'true' : env.RELEASE_DEVICE_QA_REQUIRED || 'false',
    VERCEL_PREVIEW_PROOF_STRICT: mode === 'preview' ? 'true' : env.VERCEL_PREVIEW_PROOF_STRICT,
  })
}

function baseRails() {
  return [
    {
      id: 'daily_loop_unbreakable',
      commands: ['test:mistake-proof-core'],
      evidence: 'tests/unit/dailyGuardrails.spec.ts; tests/e2e/mistake-proof-log.spec.ts; tests/e2e/surface-consistency.spec.ts',
    },
    {
      id: 'food_logging_trust_superior',
      commands: ['test:logger-speed', 'test:food-trust', 'test:food-db-trust'],
      evidence: 'tests/e2e/logger-speed.spec.ts; tests/unit/foodTrust.spec.ts; tests/unit/foodDatabaseTrust.spec.ts',
    },
    {
      id: 'coach_local_paid_superior',
      commands: ['test:coach-proof'],
      evidence: 'tests/unit/coachProofAnswer.spec.ts; tests/e2e/coach-proof.spec.ts',
    },
    {
      id: 'cut_engine_validated',
      commands: ['test:cut-os:replay', 'test:cut-os:benchmark', 'test:history-import:corpus'],
      evidence: 'tests/unit/cutOsReplay.spec.ts; tests/unit/cutOsBenchmark.spec.ts; tests/unit/historyImport.corpus.spec.ts',
    },
    {
      id: 'paid_account_ready',
      commands: ['test:paid-ops'],
      evidence: 'tests/unit/billingOps.spec.ts; tests/unit/supportBundle.spec.ts',
    },
    {
      id: 'support_recovery_ready',
      commands: ['test:recovery-layer:unit'],
      evidence: 'tests/unit/sync.psmfRecovery.spec.ts; tests/integration/storage.psmfRecovery.spec.ts',
    },
    {
      id: 'visual_polish_verified',
      commands: ['test:visual-polish'],
      evidence: 'test-results/visual-polish',
    },
  ]
}

export function resolveTenOutOfTenPlan({ mode = 'local' } = {}) {
  const rails = baseRails()

  if (mode === 'preview') {
    rails.push({
      id: 'production_operable',
      commands: ['deploy:vercel:preview-proof'],
      evidence: 'tmp/vercel-preview-proof.json',
    })
    rails.push({
      id: 'physical_device_verified',
      commands: ['test:native-device-proof'],
      evidence: 'tmp/native-device-proof-report.json',
      pendingArtifact: 'tmp/native-device-proof-report.json',
    })
    return rails
  }

  if (mode === 'production') {
    rails.push({
      id: 'production_operable',
      commands: ['test:release:proof'],
      evidence: 'tmp/production-proof-report.json',
    })
    rails.push({
      id: 'physical_device_verified',
      commands: ['test:device-qa:evidence', 'test:native-device-proof'],
      evidence: 'docs/device-qa-results/<build-id>.json',
      pendingArtifact: 'tmp/native-device-proof-report.json',
    })
    return rails
  }

  rails.push({
    id: 'production_operable',
    commands: [
      'test:security:audit',
      'lint',
      'build',
      'test:bundle',
      'test:unit',
      'test:e2e',
      'test:e2e:lane-guard',
      'test:e2e:personal-library-preview',
      'test:e2e:coach-preview',
      'test:module-budgets',
      'test:server:function-typecheck',
      'test:server:deploy-clean',
      'test:release:hygiene',
      'test:release:accessible',
    ],
    evidence: 'tmp/production-rails-accessible-report.json',
    pendingArtifact: 'tmp/production-rails-accessible-report.json',
  })
  rails.push({
    id: 'physical_device_verified',
    commands: ['test:native-device-proof'],
    evidence: 'tmp/native-device-proof-report.json',
    pendingArtifact: 'tmp/native-device-proof-report.json',
  })
  return rails
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
        command: `npm run ${scriptName}`,
        status: typeof code === 'number' ? code : 1,
        durationMs: Date.now() - startedAt,
      })
    })
    child.on('error', (error) => {
      console.error(error.message)
      resolve({
        command: `npm run ${scriptName}`,
        status: 1,
        durationMs: Date.now() - startedAt,
        reason: error.message,
      })
    })
  })
}

function readJson(path) {
  const resolved = resolve(path)
  if (!existsSync(resolved)) {
    return null
  }
  return JSON.parse(readFileSync(resolved, 'utf8'))
}

export function derivePendingExternalFromArtifact(path) {
  const artifact = readJson(path)
  if (!artifact) {
    return null
  }

  if (Array.isArray(artifact.pending) && artifact.pending.length > 0) {
    return artifact.pending.map((entry) => `${entry.id}: ${entry.reason}`).join('; ')
  }

  if (artifact.status === 'pending') {
    if (Array.isArray(artifact.blockers) && artifact.blockers.length > 0) {
      return artifact.blockers.join('; ')
    }
    return 'External proof is pending.'
  }

  if (artifact.status === 'accessible_green_external_pending') {
    return 'Accessible rails are green; strict external production proof remains pending.'
  }

  return null
}

function railStatusFromCommands({ rail, commandResults, mode }) {
  const failed = commandResults.find((result) => result.status !== 0)
  if (failed) {
    return {
      status: 'failed',
      blocker: failed.reason || `${failed.command} exited ${failed.status}.`,
    }
  }

  const pendingReason = rail.pendingArtifact ? derivePendingExternalFromArtifact(rail.pendingArtifact) : null
  if (pendingReason && mode !== 'production') {
    return {
      status: 'pending_external',
      blocker: pendingReason,
    }
  }

  return {
    status: 'passed',
  }
}

function writeReport(report, path = TEN_OUT_OF_TEN_REPORT_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
}

export function validateTenReportShape(report) {
  const errors = []
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['10/10 report must be a JSON object.']
  }
  if (!report.buildId) {
    errors.push('10/10 report missing buildId.')
  }
  if (!report.gitSha) {
    errors.push('10/10 report missing gitSha.')
  }
  if (report.target !== TEN_OUT_OF_TEN_TARGET) {
    errors.push(`10/10 report target must be ${TEN_OUT_OF_TEN_TARGET}.`)
  }
  const rails = Array.isArray(report.rails) ? report.rails : []
  for (const id of TEN_RAIL_IDS) {
    if (!rails.find((rail) => rail?.id === id)) {
      errors.push(`10/10 report missing rail ${id}.`)
    }
  }
  return errors
}

export async function runTenOutOfTenSuite({ mode = 'local', env = process.env } = {}) {
  const gitSha = readGitSha()
  const suiteEnv = buildTenOutOfTenEnv({ env, mode, gitSha })
  const plan = resolveTenOutOfTenPlan({ mode })
  const report = {
    buildId: suiteEnv.VITE_APP_BUILD_ID,
    gitSha,
    checkedAt: new Date().toISOString(),
    target: TEN_OUT_OF_TEN_TARGET,
    mode,
    status: 'failed',
    rails: [],
  }

  console.log(`10/10 ${mode} suite build id: ${report.buildId}`)
  for (const rail of plan) {
    console.log(`\n--- ${rail.id} ---`)
    const commandResults = []
    for (const command of rail.commands) {
      const result = await runNpmScript(command, suiteEnv)
      commandResults.push(result)
      if (result.status !== 0) {
        break
      }
    }

    const status = railStatusFromCommands({ rail, commandResults, mode })
    report.rails.push({
      id: rail.id,
      status: status.status,
      evidence: rail.evidence,
      blocker: status.blocker,
      commands: commandResults,
    })
    writeReport(report)

    if (status.status === 'failed') {
      return report
    }
  }

  const failedRails = report.rails.filter((rail) => rail.status === 'failed')
  const pendingRails = report.rails.filter((rail) => rail.status === 'pending_external')
  report.status = failedRails.length
    ? 'failed'
    : pendingRails.length
      ? 'local_green_external_pending'
      : 'passed'
  writeReport(report)
  return report
}

function parseMode(argv) {
  const modeArg = argv.find((arg) => arg.startsWith('--mode='))
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'local'
  if (['local', 'preview', 'production'].includes(mode)) {
    return mode
  }
  throw new Error(`Unsupported 10/10 suite mode: ${mode}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = parseMode(process.argv.slice(2))
  const report = await runTenOutOfTenSuite({ mode })
  const failures = report.rails.filter((rail) => rail.status === 'failed')
  const pending = report.rails.filter((rail) => rail.status === 'pending_external')

  if (failures.length) {
    console.error('10/10 suite failed:')
    for (const rail of failures) {
      console.error(`- ${rail.id}: ${rail.blocker ?? 'failed'}`)
    }
    console.error(`Report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
    process.exit(1)
  }

  if ((mode === 'production' || truthy(process.env.TEN_OUT_OF_TEN_REQUIRE_ALL)) && pending.length) {
    console.error('10/10 suite has pending external proof:')
    for (const rail of pending) {
      console.error(`- ${rail.id}: ${rail.blocker ?? 'pending external proof'}`)
    }
    console.error(`Report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
    process.exit(1)
  }

  if (pending.length) {
    console.log('10/10 local rails are green; external rails remain pending:')
    for (const rail of pending) {
      console.log(`- ${rail.id}: ${rail.blocker ?? 'pending external proof'}`)
    }
  } else {
    console.log(`10/10 ${mode} suite passed.`)
  }
  console.log(`Report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
}
