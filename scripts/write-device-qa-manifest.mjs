import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { REQUIRED_DEVICE_QA_CHECKS, validateDeviceQaEvidence } from './check-device-qa-evidence.mjs'

export function resolveDeviceQaSourcePath(env = process.env) {
  return env.DEVICE_QA_RESULT_SOURCE || env.DEVICE_QA_OPERATOR_EVIDENCE_JSON || ''
}

function readGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function normalizeAutomationMode(value) {
  return value === 'automated' || value === 'operator_assisted' ? value : null
}

function normalizeCheck(check) {
  return {
    id: String(check?.id ?? ''),
    status: check?.status === 'passed' ? 'passed' : 'failed',
    evidence: String(check?.evidence ?? ''),
    automationMode: normalizeAutomationMode(check?.automationMode) ?? 'operator_assisted',
  }
}

export function buildDeviceQaManifest(raw, expected) {
  const buildId = expected.buildId || raw?.buildId
  const gitSha = expected.gitSha || raw?.gitSha
  const rawChecks = Array.isArray(raw?.checks) ? raw.checks : []
  const checksById = new Map(rawChecks.map((check) => [check?.id, normalizeCheck(check)]))

  return {
    buildId,
    gitSha,
    checkedAt: raw?.checkedAt || new Date().toISOString(),
    tester: raw?.tester || expected.tester || 'operator',
    device: raw?.device || expected.device || 'physical_android',
    deviceModel: raw?.deviceModel || expected.deviceModel || 'unknown physical device',
    osVersion: raw?.osVersion || expected.osVersion || 'unknown',
    browser: raw?.browser || expected.browser || 'Chrome',
    installMode: raw?.installMode || expected.installMode || 'pwa',
    checks: REQUIRED_DEVICE_QA_CHECKS.map((id) => checksById.get(id) ?? {
      id,
      status: 'failed',
      evidence: '',
      automationMode: 'operator_assisted',
    }),
  }
}

export function writeDeviceQaManifestFromSource({ sourcePath, buildId, gitSha, outputPath }) {
  if (!sourcePath) {
    throw new Error('DEVICE_QA_RESULT_SOURCE or DEVICE_QA_OPERATOR_EVIDENCE_JSON is required to write the device QA manifest.')
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Device QA source evidence does not exist: ${sourcePath}`)
  }

  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const manifest = buildDeviceQaManifest(raw, { buildId, gitSha })
  const violations = validateDeviceQaEvidence(manifest, { buildId, gitSha })
  if (violations.length) {
    throw new Error(`Device QA evidence is incomplete:\n- ${violations.join('\n- ')}`)
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildId = process.env.VITE_APP_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA
  if (!buildId) {
    console.error('VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA is required.')
    process.exit(1)
  }

  const gitSha = readGitSha()
  const outputPath = resolve('docs', 'device-qa-results', `${buildId}.json`)
  try {
    writeDeviceQaManifestFromSource({
      sourcePath: resolveDeviceQaSourcePath(),
      buildId,
      gitSha,
      outputPath,
    })
    console.log(`Wrote device QA manifest: ${outputPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Device QA manifest writing failed.')
    process.exit(1)
  }
}
