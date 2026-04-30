import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REQUIRED_CHECKS = [
  'camera_permission_denied',
  'barcode_permission_granted',
  'barcode_manual_fallback',
  'ocr_capture_save',
  'ai_meal_photo_review',
  'pwa_install_reopen',
  'offline_reopen_log',
  'discard_dialog_hit_test',
]

function isStrict() {
  return (
    process.env.PRODUCTION_RELEASE_REQUIRED === 'true' ||
    process.env.RELEASE_DEVICE_QA_REQUIRED === 'true' ||
    process.env.VERCEL_ENV === 'production'
  )
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const buildId = process.env.VITE_APP_BUILD_ID || `local-${gitSha().slice(0, 12)}`
const manifestPath = resolve(join('docs', 'device-qa-results', `${buildId}.json`))
const reportPath = resolve(join('tmp', 'native-device-proof-report.json'))
mkdirSync(resolve('tmp'), { recursive: true })

const report = {
  checkedAt: new Date().toISOString(),
  buildId,
  gitSha: gitSha(),
  manifestPath,
  status: 'pending',
  blockers: [],
}

if (!existsSync(manifestPath)) {
  report.blockers.push(`Missing physical-device manifest ${manifestPath}.`)
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const checks = Array.isArray(manifest.checks) ? manifest.checks : []
  for (const checkId of REQUIRED_CHECKS) {
    const check = checks.find((candidate) => candidate.id === checkId)
    if (!check) {
      report.blockers.push(`Missing device QA check ${checkId}.`)
    } else if (check.status !== 'passed') {
      report.blockers.push(`Device QA check ${checkId} is ${check.status}.`)
    } else if (!check.evidence || !check.automationMode) {
      report.blockers.push(`Device QA check ${checkId} lacks evidence or automationMode.`)
    }
  }

  if (manifest.buildId && manifest.buildId !== buildId) {
    report.blockers.push(`Manifest build ID ${manifest.buildId} does not match ${buildId}.`)
  }
}

report.status = report.blockers.length === 0 ? 'passed' : isStrict() ? 'failed' : 'pending'
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (report.status === 'failed') {
  console.error('Native device proof failed:')
  for (const blocker of report.blockers) {
    console.error(`- ${blocker}`)
  }
  process.exit(1)
}

if (report.status === 'pending') {
  console.log('Native device proof pending; strict production release will fail until physical evidence is attached.')
  process.exit(0)
}

console.log(`Native device proof verified: ${manifestPath}`)
