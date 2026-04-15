import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const repoRoot = process.cwd()
export const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
export const corpusStatusPath = path.join(fixturesDir, 'corpus-status.json')
export const engineeringAcceptancePath = path.join(fixturesDir, 'engineering-acceptance.json')
export const manualAcceptancePath = path.join(fixturesDir, 'wave1-manual-acceptance.json')
export const benchmarkResultsPath = path.join(repoRoot, 'tmp', 'food-truth-benchmark-results.json')
export const packageJsonPath = path.join(repoRoot, 'package.json')

export const PRODUCTION_LIKE_ENV = {
  MODE: 'production',
  VITE_FF_IMPORT_TRUST_V1: 'true',
  VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
  VITE_FF_LABEL_OCR_TRUST_V1: 'true',
  VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'false',
}

export const REQUIRED_WAVE1_SCENARIOS = [
  'barcodeExactAutolog',
  'barcodeWeakBasisReview',
  'ocrExplicitServingReview',
  'ocrAmbiguousServingBlocked',
  'diagnosticsReview',
]

const ENGINEERING_EXTRA_PATHS = [
  path.join(repoRoot, 'tests', 'e2e', 'helpers', 'foodTruth.ts'),
  path.join(repoRoot, 'tests', 'e2e', 'preview', 'food-truth-wave1.acceptance.spec.ts'),
  path.join(repoRoot, 'playwright.food-truth-wave1.config.ts'),
]

function walkFiles(dirPath, accumulator) {
  if (!fs.existsSync(dirPath)) {
    return
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walkFiles(nextPath, accumulator)
      continue
    }
    if (entry.isFile()) {
      accumulator.push(nextPath)
    }
  }
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function normalizeEnv(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

export function assertIsoTimestamp(value, label, fail) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be an ISO timestamp string.`)
  }
}

export function assertStringArray(value, label, fail, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`)
  }
  if (!allowEmpty && value.length === 0) {
    fail(`${label} must be a non-empty array of non-empty strings.`)
  }
  if (value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${label} must contain only non-empty strings.`)
  }
}

export function readAppVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return typeof packageJson.version === 'string' && packageJson.version.trim()
    ? packageJson.version.trim()
    : null
}

export function resolveOperator(explicitOperator, fail) {
  if (explicitOperator) {
    return explicitOperator
  }

  try {
    const gitName = execFileSync('git', ['config', 'user.name'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitName) {
      return gitName
    }
  } catch {
    // Ignore and continue to environment fallback.
  }

  const envOperator = process.env.USERNAME?.trim() || process.env.USER?.trim()
  if (envOperator) {
    return envOperator
  }

  fail('operator name is required; use --operator or configure git user.name.')
}

export function createPendingWave1ManualAcceptance() {
  return {
    status: 'pending',
    executedAt: null,
    executedBy: [],
    buildMode: 'production_like',
    appVersion: null,
    notes: 'Fill this after the prod-like Wave 1 manual acceptance pass.',
    scenarios: Object.fromEntries(
      REQUIRED_WAVE1_SCENARIOS.map((scenarioId) => [scenarioId, { status: 'pending', notes: '' }]),
    ),
  }
}

export function createPendingEngineeringAcceptance() {
  return {
    status: 'pending',
    executedAt: null,
    buildMode: 'production_like',
    appVersion: null,
    inputFingerprint: null,
    notes: 'Run the automated Wave 1 engineering acceptance suite to populate this file.',
    scenarios: Object.fromEntries(
      REQUIRED_WAVE1_SCENARIOS.map((scenarioId) => [scenarioId, { status: 'pending', notes: '' }]),
    ),
  }
}

export function createSyntheticCorpusStatus() {
  return {
    mode: 'synthetic_engineering',
    preparedFromBackupExportAt: null,
    syntheticPreparedAt: new Date().toISOString(),
    sanitizedBy: [],
    approvedAt: null,
    approvedBy: [],
    notes: 'Synthetic engineering corpus only; not launch evidence.',
  }
}

export function createRealPantryCorpusStatus({
  operator,
  backupExportedAt,
  deferBranchProtectionCheck,
}) {
  return {
    mode: 'real_pantry',
    preparedFromBackupExportAt: backupExportedAt,
    syntheticPreparedAt: null,
    sanitizedBy: [operator],
    approvedAt: new Date().toISOString(),
    approvedBy: [operator],
    notes: deferBranchProtectionCheck
      ? 'Real pantry corpus captured locally; branch-protection token check deferred during capture.'
      : 'Real pantry corpus captured and validated.',
  }
}

export function computeFoodTruthFingerprint({
  fixturesRoot = fixturesDir,
  includeEngineeringFiles = false,
  excludeFixtureRelativePaths = ['engineering-acceptance.json'],
} = {}) {
  const fixtureFiles = []
  walkFiles(fixturesRoot, fixtureFiles)
  const excludedFixturePaths = new Set(
    excludeFixtureRelativePaths.map((relativePath) => path.join(fixturesRoot, relativePath)),
  )

  const filesToHash = fixtureFiles
    .filter((filePath) => !excludedFixturePaths.has(filePath))
    .sort((left, right) => left.localeCompare(right))

  if (includeEngineeringFiles) {
    filesToHash.push(...ENGINEERING_EXTRA_PATHS)
  }

  const hash = crypto.createHash('sha256')
  for (const filePath of filesToHash) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing fingerprint input at ${path.relative(repoRoot, filePath)}.`)
    }
    hash.update(path.relative(repoRoot, filePath))
    hash.update('\n')
    hash.update(fs.readFileSync(filePath))
    hash.update('\n')
  }
  return hash.digest('hex')
}
