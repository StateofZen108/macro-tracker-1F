import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const benchmarkResultsPath = path.join(repoRoot, 'tmp', 'food-truth-benchmark-results.json')
const manifestPath = path.join(fixturesDir, 'manifest.json')
const corpusStatusPath = path.join(fixturesDir, 'corpus-status.json')
const manualAcceptancePath = path.join(fixturesDir, 'wave1-manual-acceptance.json')

const REQUIRED_ENV = {
  MODE: 'production',
  VITE_FF_IMPORT_TRUST_V1: 'true',
  VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
  VITE_FF_LABEL_OCR_TRUST_V1: 'true',
  VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'false',
}

const REQUIRED_SCENARIOS = [
  'barcodeExactAutolog',
  'barcodeWeakBasisReview',
  'ocrExplicitServingReview',
  'ocrAmbiguousServingBlocked',
  'diagnosticsReview',
]

const PLACEHOLDER_PRODUCT_SLUG = /^(?:pantry-|fallback-shake|granola-\d{3}|protein-item-\d{3}|label-item-\d{3}|per100g-item-\d{3}|per100ml-item-\d{3}|dual-column-hard-case|per100g-hard-case|per100ml-hard-case|container-hard-case|troublesome-manual-hard-case)/i

function fail(message) {
  console.error(`food-truth-wave1-launch-gate: ${message}`)
  process.exit(1)
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file at ${path.relative(repoRoot, filePath)}.`)
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeEnv(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be an ISO timestamp string.`)
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${label} must be a non-empty array of non-empty strings.`)
  }
}

function validateEnv() {
  for (const [key, expected] of Object.entries(REQUIRED_ENV)) {
    const actual = normalizeEnv(process.env[key])
    if (actual !== expected) {
      fail(`${key} must equal "${expected}" for Wave 1 launch, received "${process.env[key] ?? ''}".`)
    }
  }
}

function validateBenchmarkResults() {
  const result = readJson(benchmarkResultsPath)
  if (result.mode !== 'live') {
    fail('benchmark results must be in live mode.')
  }

  const summary = result.summary ?? {}
  if (summary.passed !== true) {
    fail('benchmark summary must report passed=true.')
  }

  if (summary.barcodeFixtureCount !== 30) {
    fail(`expected 30 barcode fixtures, received ${summary.barcodeFixtureCount ?? '<missing>'}.`)
  }

  if (summary.ocrFixtureCount !== 20) {
    fail(`expected 20 OCR fixtures, received ${summary.ocrFixtureCount ?? '<missing>'}.`)
  }

  if (summary.falseAutologCount !== 0) {
    fail(`falseAutologCount must be 0, received ${summary.falseAutologCount ?? '<missing>'}.`)
  }

  const thresholdChecks = [
    ['weakBasisDowngradeRate', 100],
    ['barcodeLookupSuccessRate', 98],
    ['barcodeIdentityAccuracy', 97],
    ['servingBasisAccuracy', 97],
    ['ocrServingBasisAccuracy', 95],
  ]

  for (const [field, minimum] of thresholdChecks) {
    const actual = Number(summary[field])
    if (!Number.isFinite(actual) || actual < minimum) {
      fail(`${field} must be >= ${minimum}, received ${summary[field] ?? '<missing>'}.`)
    }
  }
}

function validateCorpusStatus() {
  const status = readJson(corpusStatusPath)
  const allowedKeys = [
    'mode',
    'preparedFromBackupExportAt',
    'syntheticPreparedAt',
    'sanitizedBy',
    'approvedAt',
    'approvedBy',
    'notes',
  ]
  for (const key of Object.keys(status)) {
    if (!allowedKeys.includes(key)) {
      fail(`corpus-status.json has unsupported key "${key}".`)
    }
  }

  if (status.mode !== 'real_pantry') {
    fail('corpus-status.json mode must be "real_pantry".')
  }

  assertIsoTimestamp(status.preparedFromBackupExportAt, 'corpus-status.json preparedFromBackupExportAt')
  assertIsoTimestamp(status.approvedAt, 'corpus-status.json approvedAt')
  assertStringArray(status.sanitizedBy, 'corpus-status.json sanitizedBy')
  assertStringArray(status.approvedBy, 'corpus-status.json approvedBy')
}

function validateManifest() {
  const manifest = readJson(manifestPath)
  if (!Array.isArray(manifest)) {
    fail('manifest.json must be an array.')
  }

  const barcodeCount = manifest.filter((entry) => entry?.kind === 'barcode').length
  const ocrCount = manifest.filter((entry) => entry?.kind === 'ocr').length
  if (barcodeCount !== 30 || ocrCount !== 20) {
    fail(`manifest.json must contain 30 barcode and 20 OCR fixtures, received ${barcodeCount} barcode and ${ocrCount} OCR.`)
  }

  for (const entry of manifest) {
    if (typeof entry?.productSlug !== 'string' || !entry.productSlug.trim()) {
      fail(`manifest entry ${entry?.id ?? '<unknown>'} is missing productSlug.`)
    }

    if (PLACEHOLDER_PRODUCT_SLUG.test(entry.productSlug)) {
      fail(`manifest entry ${entry.id} still uses placeholder productSlug "${entry.productSlug}".`)
    }
  }
}

function validateManualAcceptance() {
  const acceptance = readJson(manualAcceptancePath)
  const allowedKeys = ['status', 'executedAt', 'executedBy', 'buildMode', 'appVersion', 'notes', 'scenarios']
  for (const key of Object.keys(acceptance)) {
    if (!allowedKeys.includes(key)) {
      fail(`wave1-manual-acceptance.json has unsupported key "${key}".`)
    }
  }

  if (acceptance.status !== 'approved') {
    fail('wave1-manual-acceptance.json status must be "approved".')
  }

  if (!['production', 'production_like'].includes(acceptance.buildMode)) {
    fail('wave1-manual-acceptance.json buildMode must be "production" or "production_like".')
  }

  assertIsoTimestamp(acceptance.executedAt, 'wave1-manual-acceptance.json executedAt')
  assertStringArray(acceptance.executedBy, 'wave1-manual-acceptance.json executedBy')

  const scenarios = acceptance.scenarios
  if (typeof scenarios !== 'object' || scenarios === null || Array.isArray(scenarios)) {
    fail('wave1-manual-acceptance.json scenarios must be an object.')
  }

  for (const scenarioId of REQUIRED_SCENARIOS) {
    const scenario = scenarios[scenarioId]
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      fail(`manual acceptance scenario "${scenarioId}" is missing.`)
    }
    if (scenario.status !== 'passed') {
      fail(`manual acceptance scenario "${scenarioId}" must be "passed".`)
    }
    if ('notes' in scenario && typeof scenario.notes !== 'string') {
      fail(`manual acceptance scenario "${scenarioId}" notes must be a string when present.`)
    }
  }
}

function verifyBranchProtection() {
  try {
    const output = execFileSync(process.execPath, ['scripts/sync-food-truth-branch-protection.mjs', 'verify'], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()

    if (!output.includes('BRANCH_PROTECTION_VERIFY_OK')) {
      fail('branch-protection verify did not report success.')
    }
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? `${error.stderr ?? ''}`.trim() : ''
    const stdout = error instanceof Error && 'stdout' in error ? `${error.stdout ?? ''}`.trim() : ''
    fail(stderr || stdout || (error instanceof Error ? error.message : `${error}`))
  }
}

function main() {
  validateEnv()
  validateBenchmarkResults()
  validateCorpusStatus()
  validateManifest()
  validateManualAcceptance()
  verifyBranchProtection()
  console.log('FOOD_TRUTH_WAVE1_LAUNCH_GATE_OK')
}

main()
