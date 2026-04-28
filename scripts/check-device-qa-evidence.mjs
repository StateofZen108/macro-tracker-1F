import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const REQUIRED_DEVICE_QA_CHECKS = [
  'camera_permission_denied',
  'barcode_permission_granted',
  'barcode_manual_fallback',
  'ocr_capture_save',
  'pwa_install_reopen',
  'offline_reopen_log',
  'discard_dialog_hit_test',
]

function resolveBuildId(env = process.env) {
  return env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || null
}

function resolveGitSha() {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function validateDeviceQaEvidence(manifest, expected) {
  const violations = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Device QA manifest must be a JSON object.']
  }

  if (manifest.buildId !== expected.buildId) {
    violations.push(`Device QA buildId mismatch: expected ${expected.buildId}, got ${manifest.buildId ?? '<missing>'}.`)
  }

  if (manifest.gitSha !== expected.gitSha) {
    violations.push(`Device QA gitSha mismatch: expected ${expected.gitSha}, got ${manifest.gitSha ?? '<missing>'}.`)
  }

  for (const field of ['checkedAt', 'tester', 'deviceModel', 'osVersion', 'browser', 'installMode']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      violations.push(`Device QA manifest missing ${field}.`)
    }
  }

  if (manifest.device !== 'physical_android' && manifest.device !== 'physical_ios') {
    violations.push('Device QA manifest device must be physical_android or physical_ios.')
  }

  const checks = Array.isArray(manifest.checks) ? manifest.checks : []
  for (const requiredId of REQUIRED_DEVICE_QA_CHECKS) {
    const check = checks.find((candidate) => candidate?.id === requiredId)
    if (!check) {
      violations.push(`Device QA missing required check: ${requiredId}`)
      continue
    }

    if (check.status !== 'passed') {
      violations.push(`Device QA check did not pass: ${requiredId}`)
    }

    if (typeof check.evidence !== 'string' || !check.evidence.trim()) {
      violations.push(`Device QA check missing evidence: ${requiredId}`)
    }
  }

  return violations
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildId = resolveBuildId()
  if (!buildId) {
    console.error('Device QA evidence check failed:')
    console.error('- Missing VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
    process.exit(1)
  }

  const gitSha = resolveGitSha()
  const manifestPath = resolve(join('docs', 'device-qa-results', `${buildId}.json`))
  if (!existsSync(manifestPath)) {
    console.error('Device QA evidence check failed:')
    console.error(`- Missing device QA manifest: ${manifestPath}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const violations = validateDeviceQaEvidence(manifest, { buildId, gitSha })
  if (violations.length) {
    console.error('Device QA evidence check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Device QA evidence verified.')
}
