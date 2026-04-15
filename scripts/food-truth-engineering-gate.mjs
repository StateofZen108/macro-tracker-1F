import {
  PRODUCTION_LIKE_ENV,
  REQUIRED_WAVE1_SCENARIOS,
  assertIsoTimestamp,
  benchmarkResultsPath,
  computeFoodTruthFingerprint,
  corpusStatusPath,
  engineeringAcceptancePath,
  normalizeEnv,
  readJson,
} from './food-truth-readiness-shared.mjs'

function fail(message) {
  console.error(`food-truth-engineering-gate: ${message}`)
  process.exit(1)
}

function validateEnv() {
  for (const [key, expected] of Object.entries(PRODUCTION_LIKE_ENV)) {
    const actual = normalizeEnv(process.env[key])
    if (actual !== expected) {
      fail(`${key} must equal "${expected}" for engineering-ready validation, received "${process.env[key] ?? ''}".`)
    }
  }
}

function validateBenchmarkResults() {
  const result = readJson(benchmarkResultsPath)
  if (result.mode !== 'live') {
    fail('benchmark results must be in live mode.')
  }
  if (result.inputFingerprint !== computeFoodTruthFingerprint()) {
    fail('benchmark results are stale for the current food-truth fixture tree.')
  }

  const summary = result.summary ?? {}
  if (summary.passed !== true) {
    fail('benchmark summary must report passed=true.')
  }

  const thresholdChecks = [
    ['weakBasisDowngradeRate', 100],
    ['barcodeLookupSuccessRate', 98],
    ['barcodeIdentityAccuracy', 97],
    ['servingBasisAccuracy', 97],
    ['ocrServingBasisAccuracy', 95],
  ]

  if (summary.falseAutologCount !== 0) {
    fail(`falseAutologCount must be 0, received ${summary.falseAutologCount ?? '<missing>'}.`)
  }

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

  if (status.mode === 'scaffold') {
    fail('corpus-status.json mode must not be "scaffold" for engineering readiness.')
  }
  if (!['synthetic_engineering', 'real_pantry'].includes(status.mode)) {
    fail(`corpus-status.json mode must be "synthetic_engineering" or "real_pantry", found "${status.mode ?? ''}".`)
  }
  if (status.mode === 'synthetic_engineering') {
    assertIsoTimestamp(status.syntheticPreparedAt, 'corpus-status.json syntheticPreparedAt', fail)
  }
}

function validateEngineeringAcceptance() {
  const acceptance = readJson(engineeringAcceptancePath)
  const allowedKeys = [
    'status',
    'executedAt',
    'buildMode',
    'appVersion',
    'inputFingerprint',
    'notes',
    'scenarios',
  ]
  for (const key of Object.keys(acceptance)) {
    if (!allowedKeys.includes(key)) {
      fail(`engineering-acceptance.json has unsupported key "${key}".`)
    }
  }

  if (acceptance.status !== 'automated_passed') {
    fail('engineering-acceptance.json status must be "automated_passed".')
  }
  if (acceptance.buildMode !== 'production_like') {
    fail('engineering-acceptance.json buildMode must be "production_like".')
  }
  assertIsoTimestamp(acceptance.executedAt, 'engineering-acceptance.json executedAt', fail)

  const expectedFingerprint = computeFoodTruthFingerprint({ includeEngineeringFiles: true })
  if (acceptance.inputFingerprint !== expectedFingerprint) {
    fail('engineering-acceptance.json inputFingerprint does not match the current engineering inputs.')
  }

  if (typeof acceptance.scenarios !== 'object' || acceptance.scenarios === null || Array.isArray(acceptance.scenarios)) {
    fail('engineering-acceptance.json scenarios must be an object.')
  }

  for (const scenarioId of REQUIRED_WAVE1_SCENARIOS) {
    const scenario = acceptance.scenarios[scenarioId]
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      fail(`engineering acceptance scenario "${scenarioId}" is missing.`)
    }
    if (scenario.status !== 'passed') {
      fail(`engineering acceptance scenario "${scenarioId}" must be "passed".`)
    }
    if ('notes' in scenario && typeof scenario.notes !== 'string') {
      fail(`engineering acceptance scenario "${scenarioId}" notes must be a string when present.`)
    }
  }
}

function main() {
  validateEnv()
  validateCorpusStatus()
  validateBenchmarkResults()
  validateEngineeringAcceptance()
  console.log('FOOD_TRUTH_ENGINEERING_READY_OK')
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : `${error}`)
}
