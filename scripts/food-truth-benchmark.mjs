import fs from 'node:fs'
import path from 'node:path'
import { computeFoodTruthFingerprint } from './food-truth-readiness-shared.mjs'

const BENCHMARK_ENV = {
  MODE: 'test',
  NODE_ENV: 'test',
  VITE_FF_IMPORT_TRUST_V1: 'true',
  VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
  VITE_FF_LABEL_OCR_TRUST_V1: 'true',
  VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'true',
  FATSECRET_CLIENT_ID: 'benchmark-client',
  FATSECRET_CLIENT_SECRET: 'benchmark-secret',
  FATSECRET_API_BASE: 'https://platform.fatsecret.com',
}

for (const [key, value] of Object.entries(BENCHMARK_ENV)) {
  process.env[key] = value
}

const repoRoot = process.cwd()
const tmpDir = path.join(repoRoot, 'tmp')
const fixturesDir = process.env.FOOD_TRUTH_FIXTURES_DIR
  ? path.resolve(process.env.FOOD_TRUTH_FIXTURES_DIR)
  : path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const manifestPath = path.join(fixturesDir, 'manifest.json')
const barcodeFixturePath = path.join(fixturesDir, 'barcode.real-world.json')
const ocrFixturePath = path.join(fixturesDir, 'ocr.real-world.json')
const seedPath = path.join(fixturesDir, 'local-state-seeds.json')
const resultsPath = process.env.FOOD_TRUTH_RESULTS_PATH
  ? path.resolve(process.env.FOOD_TRUTH_RESULTS_PATH)
  : path.join(tmpDir, 'food-truth-benchmark-results.json')
const ocrImageDir = path.join(fixturesDir, 'ocr-images')
const barcodeReplayDirs = {
  fatsecretBarcode: path.join(fixturesDir, 'provider-replays', 'fatsecret', 'barcode'),
  fatsecretOauth: path.join(fixturesDir, 'provider-replays', 'fatsecret', 'oauth'),
  openFoodFacts: path.join(fixturesDir, 'provider-replays', 'open-food-facts', 'barcode'),
}
const ocrReplayDir = path.join(fixturesDir, 'provider-replays', 'gemini', 'ocr')
const BARCODE_COUNT = 30
const OCR_COUNT = 20
const IMAGE_NAME_PATTERN = /^ocr-\d{3}-[a-z0-9-]+\.(png|jpg)$/i
const TOKEN_REQUEST_KEY = 'POST https://oauth.fatsecret.com/connect/token'
const ROOT_ALLOWED_SOURCE_KEYS = ['local_history', 'manual_hard_case']

function ensureTmpDir() {
  fs.mkdirSync(tmpDir, { recursive: true })
}

function writeSummary(message) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${message}\n`)
  }
}

function normalizePercentage(numerator, denominator) {
  if (denominator <= 0) {
    return 100
  }
  return Math.round((numerator / denominator) * 10000) / 100
}

function roundNumber(value) {
  return Math.round(value * 1000) / 1000
}

function normalizeText(value) {
  return `${value ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBarcode(value) {
  return `${value ?? ''}`.replace(/\D/g, '')
}

function fail(message) {
  throw new Error(message)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeResults(result) {
  ensureTmpDir()
  fs.writeFileSync(resultsPath, `${JSON.stringify(result, null, 2)}\n`)
}

function createBootstrapResult() {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'bootstrap',
    inputFingerprint: null,
    summary: {
      barcodeFixtureCount: 0,
      ocrFixtureCount: 0,
      falseAutologCount: 0,
      weakBasisDowngradeRate: 0,
      barcodeLookupSuccessRate: 0,
      barcodeIdentityAccuracy: 0,
      servingBasisAccuracy: 0,
      ocrServingBasisAccuracy: 0,
      passed: false,
    },
    barcodeResults: [],
    ocrResults: [],
    failures: [],
  }
}

function bootstrapPending() {
  const message = 'BOOTSTRAP_PENDING_BENCHMARK_CORPUS'
  const result = createBootstrapResult()
  writeResults(result)
  console.log(message)
  console.log('Not a benchmark pass; corpus not landed yet.')
  writeSummary(message)
  writeSummary('Not a benchmark pass; corpus not landed yet.')
  process.exit(0)
}

function assertExactKeys(record, allowedKeys, label) {
  const recordKeys = Object.keys(record).sort()
  const expectedKeys = [...allowedKeys].sort()
  const extraKeys = recordKeys.filter((key) => !expectedKeys.includes(key))
  if (extraKeys.length) {
    fail(`${label} has unsupported keys: ${extraKeys.join(', ')}`)
  }
}

function assertRequiredFields(record, requiredKeys, label) {
  for (const key of requiredKeys) {
    if (!(key in record)) {
      fail(`${label} is missing required field "${key}".`)
    }
  }
}

function assertNutritionObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`)
  }
  assertRequiredFields(value, ['calories', 'protein', 'carbs', 'fat'], label)
}

function assertImageFile(imageFile, fixtureId) {
  if (typeof imageFile !== 'string' || !IMAGE_NAME_PATTERN.test(imageFile)) {
    fail(`OCR fixture "${fixtureId}" has invalid imageFile "${imageFile}".`)
  }
  const imagePath = path.join(ocrImageDir, imageFile)
  if (!fs.existsSync(imagePath)) {
    fail(`OCR fixture "${fixtureId}" is missing image "${imageFile}".`)
  }
  const stats = fs.statSync(imagePath)
  if (stats.size > 1.5 * 1024 * 1024) {
    fail(`OCR fixture "${fixtureId}" image exceeds 1.5MB.`)
  }
}

function validateManifest(manifest, barcodeFixtures, ocrFixtures) {
  if (!Array.isArray(manifest)) {
    fail('food-truth-benchmark: manifest.json must be an array.')
  }
  const barcodeIds = new Set(barcodeFixtures.map((entry) => entry.id))
  const ocrIds = new Set(ocrFixtures.map((entry) => entry.id))
  const manifestIds = new Set()

  for (const entry of manifest) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail('food-truth-benchmark: manifest entries must be objects.')
    }
    assertRequiredFields(
      entry,
      [
        'id',
        'kind',
        'productSlug',
        'source',
        'expectedTrustLevel',
        'expectedServingBasis',
        'expectedServingBasisSource',
        'expectedNutrition',
        'refreshedAt',
        'sourceWindowStart',
        'sourceWindowEnd',
      ],
      `manifest entry ${entry.id ?? '<unknown>'}`,
    )
    if (manifestIds.has(entry.id)) {
      fail(`food-truth-benchmark: duplicate manifest id "${entry.id}".`)
    }
    manifestIds.add(entry.id)
    if (!['barcode', 'ocr'].includes(entry.kind)) {
      fail(`food-truth-benchmark: manifest entry "${entry.id}" has invalid kind.`)
    }
    if (!ROOT_ALLOWED_SOURCE_KEYS.includes(entry.source)) {
      fail(`food-truth-benchmark: manifest entry "${entry.id}" has invalid source.`)
    }
    assertNutritionObject(entry.expectedNutrition, `manifest entry ${entry.id} expectedNutrition`)
    if (entry.kind === 'barcode' && !barcodeIds.has(entry.id)) {
      fail(`food-truth-benchmark: barcode manifest entry "${entry.id}" is missing from barcode.real-world.json.`)
    }
    if (entry.kind === 'ocr') {
      if (!ocrIds.has(entry.id)) {
        fail(`food-truth-benchmark: OCR manifest entry "${entry.id}" is missing from ocr.real-world.json.`)
      }
      assertImageFile(entry.imageFile, entry.id)
    }
  }
}

function validateSeedFood(seed) {
  assertExactKeys(seed.food, [
    'id',
    'name',
    'brand',
    'barcode',
    'servingSize',
    'servingUnit',
    'calories',
    'protein',
    'carbs',
    'fat',
    'fiber',
    'source',
    'usageCount',
    'createdAt',
    'provider',
    'remoteReferences',
    'importTrust',
    'lastUsedAt',
    'updatedAt',
  ], `seed ${seed.id} food`)

  assertRequiredFields(
    seed.food,
    [
      'id',
      'name',
      'servingSize',
      'servingUnit',
      'calories',
      'protein',
      'carbs',
      'fat',
      'source',
      'usageCount',
      'createdAt',
    ],
    `seed ${seed.id} food`,
  )

  if (seed.food.importTrust) {
    assertExactKeys(seed.food.importTrust, [
      'level',
      'servingBasis',
      'servingBasisSource',
      'blockingIssues',
      'verifiedAt',
    ], `seed ${seed.id} importTrust`)
  }

  if (seed.food.remoteReferences) {
    if (!Array.isArray(seed.food.remoteReferences)) {
      fail(`seed ${seed.id} remoteReferences must be an array.`)
    }
    for (const [index, reference] of seed.food.remoteReferences.entries()) {
      assertExactKeys(reference, ['provider', 'remoteKey', 'barcode'], `seed ${seed.id} remoteReferences[${index}]`)
      assertRequiredFields(reference, ['provider', 'remoteKey'], `seed ${seed.id} remoteReferences[${index}]`)
    }
  }
}

function validateFixtures(barcodeFixtures, ocrFixtures, seeds) {
  if (!Array.isArray(barcodeFixtures) || !Array.isArray(ocrFixtures) || !Array.isArray(seeds)) {
    fail('food-truth-benchmark: barcode fixtures, OCR fixtures, and seed fixtures must be arrays.')
  }
  if (barcodeFixtures.length !== BARCODE_COUNT) {
    fail(`food-truth-benchmark: expected ${BARCODE_COUNT} barcode fixtures, found ${barcodeFixtures.length}.`)
  }
  if (ocrFixtures.length !== OCR_COUNT) {
    fail(`food-truth-benchmark: expected ${OCR_COUNT} OCR fixtures, found ${ocrFixtures.length}.`)
  }

  const seenIds = new Set()
  for (const fixture of barcodeFixtures) {
    assertRequiredFields(
      fixture,
      [
        'id',
        'barcode',
        'productSlug',
        'expectedName',
        'expectedTrustLevel',
        'expectedServingBasis',
        'expectedServingBasisSource',
        'expectedNutrition',
      ],
      `barcode fixture ${fixture.id ?? '<unknown>'}`,
    )
    if (seenIds.has(fixture.id)) {
      fail(`food-truth-benchmark: duplicate fixture id "${fixture.id}".`)
    }
    seenIds.add(fixture.id)
    assertNutritionObject(fixture.expectedNutrition, `barcode fixture ${fixture.id} expectedNutrition`)
  }

  for (const fixture of ocrFixtures) {
    assertRequiredFields(
      fixture,
      [
        'id',
        'imageFile',
        'productSlug',
        'expectedName',
        'expectedTrustLevel',
        'expectedServingBasis',
        'expectedServingBasisSource',
        'expectedNutrition',
        'ocrReplayFile',
        'reviewSelection',
      ],
      `ocr fixture ${fixture.id ?? '<unknown>'}`,
    )
    if (seenIds.has(fixture.id)) {
      fail(`food-truth-benchmark: duplicate fixture id "${fixture.id}".`)
    }
    seenIds.add(fixture.id)
    assertNutritionObject(fixture.expectedNutrition, `ocr fixture ${fixture.id} expectedNutrition`)
    assertImageFile(fixture.imageFile, fixture.id)
    if (
      typeof fixture.reviewSelection !== 'object' ||
      fixture.reviewSelection === null ||
      Array.isArray(fixture.reviewSelection)
    ) {
      fail(`ocr fixture ${fixture.id} reviewSelection must be an object.`)
    }
    assertRequiredFields(
      fixture.reviewSelection,
      ['interpretationId', 'kind'],
      `ocr fixture ${fixture.id} reviewSelection`,
    )
  }

  const seedIds = new Set()
  for (const seed of seeds) {
    if (typeof seed !== 'object' || seed === null || Array.isArray(seed)) {
      fail('food-truth-benchmark: local-state-seeds.json must contain objects.')
    }
    assertRequiredFields(seed, ['id', 'purpose', 'food'], `seed ${seed.id ?? '<unknown>'}`)
    if (seedIds.has(seed.id)) {
      fail(`food-truth-benchmark: duplicate seed id "${seed.id}".`)
    }
    seedIds.add(seed.id)
    validateSeedFood(seed)
  }

  for (const fixture of barcodeFixtures) {
    if (fixture.localStateSeedId && !seedIds.has(fixture.localStateSeedId)) {
      fail(`barcode fixture ${fixture.id} references missing seed "${fixture.localStateSeedId}".`)
    }
  }
}

function normalizeRequestKey(method, requestUrl) {
  const url = new URL(requestUrl)
  const sortedEntries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyDelta = leftKey.localeCompare(rightKey)
    return keyDelta !== 0 ? keyDelta : leftValue.localeCompare(rightValue)
  })
  const sortedQuery = new URLSearchParams()
  for (const [key, value] of sortedEntries) {
    sortedQuery.append(key, value)
  }
  const querySuffix = sortedEntries.length ? `?${sortedQuery.toString()}` : ''
  return `${method.toUpperCase()} ${url.origin}${url.pathname}${querySuffix}`
}

function buildAllowedRequestKeys(barcode) {
  return new Set([
    TOKEN_REQUEST_KEY,
    normalizeRequestKey(
      'GET',
      `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?barcode=${barcode}&flag_default_serving=true&format=json&language=en&region=US`,
    ),
    normalizeRequestKey('GET', `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`),
  ])
}

function readReplayFileIfPresent(filePath, fixtureId) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  const replay = readJson(filePath)
  if (typeof replay !== 'object' || replay === null || Array.isArray(replay)) {
    fail(`Replay file "${path.relative(repoRoot, filePath)}" must contain an object.`)
  }
  assertRequiredFields(replay, ['fixtureId', 'requestKey', 'responses'], `replay file ${filePath}`)
  if (replay.fixtureId !== fixtureId) {
    fail(`Replay file "${path.relative(repoRoot, filePath)}" has fixtureId "${replay.fixtureId}" but expected "${fixtureId}".`)
  }
  if (!Array.isArray(replay.responses) || replay.responses.length < 1) {
    fail(`Replay file "${path.relative(repoRoot, filePath)}" must contain a non-empty responses array.`)
  }
  for (const [index, response] of replay.responses.entries()) {
    assertRequiredFields(response, ['status', 'headers', 'body'], `replay response ${filePath}[${index}]`)
  }
  return replay
}

function buildReplayState(fixture) {
  const barcode = normalizeBarcode(fixture.barcode)
  const allowedRequestKeys = buildAllowedRequestKeys(barcode)
  const replays = new Map()
  const replayFiles = [
    path.join(barcodeReplayDirs.fatsecretOauth, `${fixture.id}.json`),
    path.join(barcodeReplayDirs.fatsecretBarcode, `${fixture.id}.json`),
    path.join(barcodeReplayDirs.openFoodFacts, `${fixture.id}.json`),
  ]

  for (const filePath of replayFiles) {
    const replay = readReplayFileIfPresent(filePath, fixture.id)
    if (!replay) {
      continue
    }
    if (!allowedRequestKeys.has(replay.requestKey)) {
      fail(`Replay file "${path.relative(repoRoot, filePath)}" has unsupported requestKey "${replay.requestKey}".`)
    }
    replays.set(replay.requestKey, {
      responses: replay.responses,
      cursor: 0,
      path: filePath,
    })
  }

  return {
    allowedRequestKeys,
    replays,
  }
}

function installReplayTransport(fixture) {
  const originalFetch = globalThis.fetch
  const replayState = buildReplayState(fixture)
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' || input instanceof URL ? `${input}` : input.url
    const method =
      init.method ??
      (typeof input === 'object' && input !== null && 'method' in input ? input.method : 'GET')
    const requestKey = normalizeRequestKey(method, requestUrl)
    if (!replayState.allowedRequestKeys.has(requestKey)) {
      throw new Error(`UNEXPECTED_REPLAY_REQUEST: ${requestKey}`)
    }

    const replay = replayState.replays.get(requestKey)
    if (!replay) {
      throw new Error(`MISSING_REPLAY_FILE: ${requestKey}`)
    }
    if (replay.cursor >= replay.responses.length) {
      throw new Error(`REPLAY_EXHAUSTED: ${requestKey}`)
    }

    const response = replay.responses[replay.cursor]
    replay.cursor += 1
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: response.headers,
    })
  }

  return () => {
    globalThis.fetch = originalFetch
  }
}

function compareNumber(expected, actual, tolerance, label, failures) {
  if (typeof expected !== 'number') {
    return true
  }
  if (typeof actual !== 'number' || Math.abs(expected - actual) > tolerance) {
    failures.push(`${label} expected ${expected} but found ${actual ?? 'missing'}`)
    return false
  }
  return true
}

function getBestMatchedReference(food, barcode) {
  const normalizedBarcode = normalizeBarcode(barcode)
  const ranked = [...(food.remoteReferences ?? [])]
    .filter((reference) => normalizeBarcode(reference.barcode) === normalizedBarcode)
    .sort((left, right) => {
      const rank = { fatsecret: 3, open_food_facts: 2, usda_fdc: 1 }
      return (rank[right.provider] ?? 0) - (rank[left.provider] ?? 0)
    })
  return ranked[0]
}

function evaluateBarcodeFixture(fixture, result) {
  const failures = []
  let source = 'failure'
  let provider
  let remoteKey
  let trustLevel
  let servingBasis
  let servingBasisSource
  let nutrition
  let name
  let brand
  let actualBarcode

  if (!result.ok) {
    failures.push(result.error.message)
  } else if (result.data.source === 'remote' && result.data.lookupResult) {
    const candidate = result.data.lookupResult.candidate
    source = 'remote'
    provider = candidate.provider
    remoteKey = candidate.remoteKey
    trustLevel = candidate.importTrust?.level ?? null
    servingBasis = candidate.importTrust?.servingBasis ?? candidate.nutritionBasis
    servingBasisSource = candidate.importTrust?.servingBasisSource ?? null
    nutrition = {
      calories: candidate.calories,
      protein: candidate.protein,
      carbs: candidate.carbs,
      fat: candidate.fat,
      fiber: candidate.fiber,
    }
    name = candidate.name
    brand = candidate.brand
    actualBarcode = candidate.barcode
  } else if (result.ok && result.data.food) {
    const food = result.data.food
    const matchedReference = getBestMatchedReference(food, fixture.barcode)
    source = result.data.source
    provider = result.data.source === 'local_remote_reference' ? matchedReference?.provider ?? food.provider : food.provider
    remoteKey = matchedReference?.remoteKey
    trustLevel = food.importTrust?.level ?? null
    servingBasis = food.importTrust?.servingBasis ?? 'serving'
    servingBasisSource = food.importTrust?.servingBasisSource ?? 'manual_review'
    nutrition = {
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
    }
    name = food.name
    brand = food.brand
    actualBarcode =
      result.data.source === 'local_remote_reference'
        ? matchedReference?.barcode ?? food.barcode
        : food.barcode
  }

  if (normalizeText(name) !== normalizeText(fixture.expectedName)) {
    failures.push(`name expected "${fixture.expectedName}" but found "${name ?? ''}"`)
  }
  if (fixture.expectedBrand && normalizeText(brand) !== normalizeText(fixture.expectedBrand)) {
    failures.push(`brand expected "${fixture.expectedBrand}" but found "${brand ?? ''}"`)
  }
  if (normalizeBarcode(actualBarcode) !== normalizeBarcode(fixture.barcode)) {
    failures.push(`barcode expected "${fixture.barcode}" but found "${actualBarcode ?? ''}"`)
  }
  if (fixture.expectedProvider && provider !== fixture.expectedProvider) {
    failures.push(`provider expected "${fixture.expectedProvider}" but found "${provider ?? ''}"`)
  }
  if (fixture.expectedRemoteKey && remoteKey !== fixture.expectedRemoteKey) {
    failures.push(`remoteKey expected "${fixture.expectedRemoteKey}" but found "${remoteKey ?? ''}"`)
  }
  if (trustLevel !== fixture.expectedTrustLevel) {
    failures.push(`trustLevel expected "${fixture.expectedTrustLevel}" but found "${trustLevel ?? ''}"`)
  }
  if (servingBasis !== fixture.expectedServingBasis) {
    failures.push(`servingBasis expected "${fixture.expectedServingBasis}" but found "${servingBasis ?? ''}"`)
  }
  if (servingBasisSource !== fixture.expectedServingBasisSource) {
    failures.push(
      `servingBasisSource expected "${fixture.expectedServingBasisSource}" but found "${servingBasisSource ?? ''}"`,
    )
  }

  compareNumber(fixture.expectedNutrition.calories, nutrition?.calories, 1, 'calories', failures)
  compareNumber(fixture.expectedNutrition.protein, nutrition?.protein, 0.5, 'protein', failures)
  compareNumber(fixture.expectedNutrition.carbs, nutrition?.carbs, 0.5, 'carbs', failures)
  compareNumber(fixture.expectedNutrition.fat, nutrition?.fat, 0.5, 'fat', failures)
  if (typeof fixture.expectedNutrition.fiber === 'number') {
    compareNumber(fixture.expectedNutrition.fiber, nutrition?.fiber, 0.5, 'fiber', failures)
  }

  return {
    id: fixture.id,
    source,
    passed: failures.length === 0,
    provider,
    remoteKey,
    trustLevel,
    servingBasis,
    servingBasisSource,
    nutrition,
    failureReasons: failures,
  }
}

function evaluateOcrFixture(fixture, hydratedSession, reviewState, reviewedDraft) {
  const failures = []
  if (normalizeText(reviewedDraft.name) !== normalizeText(fixture.expectedName)) {
    failures.push(`name expected "${fixture.expectedName}" but found "${reviewedDraft.name}"`)
  }
  if (fixture.expectedBrand && normalizeText(reviewedDraft.brand) !== normalizeText(fixture.expectedBrand)) {
    failures.push(`brand expected "${fixture.expectedBrand}" but found "${reviewedDraft.brand ?? ''}"`)
  }
  if (reviewedDraft.importTrust?.level !== fixture.expectedTrustLevel) {
    failures.push(
      `trustLevel expected "${fixture.expectedTrustLevel}" but found "${reviewedDraft.importTrust?.level ?? ''}"`,
    )
  }
  if (reviewedDraft.importTrust?.servingBasis !== fixture.expectedServingBasis) {
    failures.push(
      `servingBasis expected "${fixture.expectedServingBasis}" but found "${reviewedDraft.importTrust?.servingBasis ?? ''}"`,
    )
  }
  if (reviewedDraft.importTrust?.servingBasisSource !== fixture.expectedServingBasisSource) {
    failures.push(
      `servingBasisSource expected "${fixture.expectedServingBasisSource}" but found "${reviewedDraft.importTrust?.servingBasisSource ?? ''}"`,
    )
  }

  compareNumber(fixture.expectedNutrition.calories, reviewedDraft.calories, 1, 'calories', failures)
  compareNumber(fixture.expectedNutrition.protein, reviewedDraft.protein, 0.5, 'protein', failures)
  compareNumber(fixture.expectedNutrition.carbs, reviewedDraft.carbs, 0.5, 'carbs', failures)
  compareNumber(fixture.expectedNutrition.fat, reviewedDraft.fat, 0.5, 'fat', failures)
  if (typeof fixture.expectedNutrition.fiber === 'number') {
    compareNumber(fixture.expectedNutrition.fiber, reviewedDraft.fiber, 0.5, 'fiber', failures)
  }

  const selectedInterpretation = hydratedSession.servingInterpretations?.find(
    (interpretation) => interpretation.id === fixture.reviewSelection.interpretationId,
  )
  if (!selectedInterpretation) {
    failures.push(`interpretation "${fixture.reviewSelection.interpretationId}" was not present in the hydrated session`)
  } else if (selectedInterpretation.kind !== fixture.reviewSelection.kind) {
    failures.push(
      `interpretation kind expected "${fixture.reviewSelection.kind}" but found "${selectedInterpretation.kind}"`,
    )
  }

  if (reviewState.selectedInterpretationId !== fixture.reviewSelection.interpretationId) {
    failures.push(
      `selectedInterpretationId expected "${fixture.reviewSelection.interpretationId}" but found "${reviewState.selectedInterpretationId ?? ''}"`,
    )
  }

  return {
    id: fixture.id,
    passed: failures.length === 0,
    selectedInterpretationId: fixture.reviewSelection.interpretationId,
    trustLevel: reviewedDraft.importTrust?.level ?? null,
    servingBasis: reviewedDraft.importTrust?.servingBasis ?? null,
    servingBasisSource: reviewedDraft.importTrust?.servingBasisSource ?? null,
    nutrition: {
      calories: reviewedDraft.calories,
      protein: reviewedDraft.protein,
      carbs: reviewedDraft.carbs,
      fat: reviewedDraft.fat,
      fiber: reviewedDraft.fiber,
    },
    failureReasons: failures,
  }
}

async function runBarcodeBenchmark(barcodeFixtures, seeds) {
  const { resolveBarcodeLookup } = await import('../src/domain/foodCatalog/barcodeResolution.ts')
  const { lookupBarcodeProviders } = await import('../server/food-catalog/providers.ts')
  const seedMap = new Map(seeds.map((seed) => [seed.id, seed]))
  const results = []

  for (const fixture of barcodeFixtures) {
    const restoreFetch = installReplayTransport(fixture)
    try {
      const foods = fixture.localStateSeedId ? [seedMap.get(fixture.localStateSeedId)?.food].filter(Boolean) : []
      const resolution = await resolveBarcodeLookup({
        barcode: fixture.barcode,
        foods,
        lookupRemote: lookupBarcodeProviders,
      })
      results.push(evaluateBarcodeFixture(fixture, resolution))
    } finally {
      restoreFetch()
    }
  }

  return results
}

async function runOcrBenchmark(ocrFixtures) {
  const { buildSessionFromProviderPayload } = await import('../src/utils/labelOcrPayload.ts')
  const {
    buildLabelReviewState,
    buildLabelReviewValues,
    buildOcrDraftFromReview,
    hydrateLabelReviewSession,
  } = await import('../src/utils/ocrReview.ts')
  const results = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('LIVE_NETWORK_CALL_FORBIDDEN')
  }

  try {
    for (const fixture of ocrFixtures) {
      const replayPath = path.join(ocrReplayDir, fixture.ocrReplayFile)
      if (!fs.existsSync(replayPath)) {
        fail(`OCR replay file missing for fixture "${fixture.id}": ${fixture.ocrReplayFile}`)
      }
      const replay = readJson(replayPath)
      if (replay.fixtureId !== fixture.id || replay.provider !== 'gemini' || typeof replay.payload !== 'object') {
        fail(`OCR replay "${fixture.ocrReplayFile}" does not match the locked schema.`)
      }

      const session = buildSessionFromProviderPayload(replay.payload)
      if (!session) {
        fail(`OCR replay "${fixture.id}" did not build a session.`)
      }

      const hydratedSession = hydrateLabelReviewSession(session)
      const matchingInterpretations =
        hydratedSession.servingInterpretations?.filter(
          (interpretation) => interpretation.id === fixture.reviewSelection.interpretationId,
        ) ?? []
      if (matchingInterpretations.length !== 1) {
        fail(`OCR fixture "${fixture.id}" expected exactly one interpretation "${fixture.reviewSelection.interpretationId}".`)
      }

      const selectedInterpretation = matchingInterpretations[0]
      if (selectedInterpretation.kind !== fixture.reviewSelection.kind) {
        fail(`OCR fixture "${fixture.id}" interpretation kind mismatch for "${fixture.reviewSelection.interpretationId}".`)
      }

      let values = buildLabelReviewValues(hydratedSession, fixture.reviewSelection.interpretationId)
      if (fixture.reviewSelection.kind === 'manual') {
        values = {
          ...values,
          servingSize: `${fixture.reviewSelection.manualServingSize}`,
          servingUnit: fixture.reviewSelection.manualServingUnit,
        }
      }

      const reviewState = buildLabelReviewState(
        hydratedSession,
        values,
        fixture.reviewSelection.interpretationId,
        false,
      )
      const reviewedDraft = buildOcrDraftFromReview(
        values,
        hydratedSession,
        fixture.reviewSelection.interpretationId,
      )

      results.push(evaluateOcrFixture(fixture, hydratedSession, reviewState, reviewedDraft))
    }
  } finally {
    globalThis.fetch = originalFetch
  }

  return results
}

function buildFailures(barcodeResults, ocrResults) {
  return [...barcodeResults, ...ocrResults].flatMap((result) =>
    result.failureReasons.map((reason) => ({
      id: result.id,
      kind: 'selectedInterpretationId' in result ? 'ocr' : 'barcode',
      reason,
      expected: null,
      actual: null,
    })),
  )
}

function buildSummary(barcodeResults, ocrResults) {
  const successfulBarcodeLookups = barcodeResults.filter((result) => result.source !== 'failure').length
  const barcodeLookupSuccessRate = normalizePercentage(successfulBarcodeLookups, barcodeResults.length)
  const barcodeIdentityAccuracy = normalizePercentage(
    barcodeResults.filter((result) =>
      result.failureReasons.every((reason) => !reason.startsWith('name') && !reason.startsWith('brand') && !reason.startsWith('barcode') && !reason.startsWith('provider') && !reason.startsWith('remoteKey')),
    ).length,
    barcodeResults.length,
  )
  const servingBasisAccuracy = normalizePercentage(
    [...barcodeResults, ...ocrResults].filter((result) =>
      result.failureReasons.every(
        (reason) => !reason.startsWith('servingBasis ') && !reason.startsWith('servingBasisSource '),
      ),
    ).length,
    barcodeResults.length + ocrResults.length,
  )
  const ocrServingBasisAccuracy = normalizePercentage(
    ocrResults.filter((result) =>
      result.failureReasons.every(
        (reason) => !reason.startsWith('servingBasis ') && !reason.startsWith('servingBasisSource '),
      ),
    ).length,
    ocrResults.length,
  )
  const weakBasisFixtures = [...barcodeResults, ...ocrResults].filter(
    (result) => result.servingBasis !== 'serving' || result.trustLevel !== 'exact_autolog',
  )
  const weakBasisDowngradeRate = normalizePercentage(
    weakBasisFixtures.filter((result) => result.trustLevel !== 'exact_autolog').length,
    weakBasisFixtures.length,
  )
  const falseAutologCount = [...barcodeResults, ...ocrResults].filter(
    (result) => result.trustLevel === 'exact_autolog' && result.servingBasis !== 'serving',
  ).length

  return {
    barcodeFixtureCount: barcodeResults.length,
    ocrFixtureCount: ocrResults.length,
    falseAutologCount,
    weakBasisDowngradeRate: roundNumber(weakBasisDowngradeRate),
    barcodeLookupSuccessRate: roundNumber(barcodeLookupSuccessRate),
    barcodeIdentityAccuracy: roundNumber(barcodeIdentityAccuracy),
    servingBasisAccuracy: roundNumber(servingBasisAccuracy),
    ocrServingBasisAccuracy: roundNumber(ocrServingBasisAccuracy),
    passed:
      falseAutologCount === 0 &&
      weakBasisDowngradeRate >= 100 &&
      barcodeLookupSuccessRate >= 98 &&
      barcodeIdentityAccuracy >= 97 &&
      servingBasisAccuracy >= 97 &&
      ocrServingBasisAccuracy >= 95,
  }
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    bootstrapPending()
  }
  if (!fs.existsSync(barcodeFixturePath) || !fs.existsSync(ocrFixturePath) || !fs.existsSync(seedPath)) {
    fail('food-truth-benchmark: manifest exists but barcode, OCR, or local-state seed fixtures are missing.')
  }

  const manifest = readJson(manifestPath)
  const barcodeFixtures = readJson(barcodeFixturePath)
  const ocrFixtures = readJson(ocrFixturePath)
  const seeds = readJson(seedPath)

  validateFixtures(barcodeFixtures, ocrFixtures, seeds)
  validateManifest(manifest, barcodeFixtures, ocrFixtures)

  const barcodeResults = await runBarcodeBenchmark(barcodeFixtures, seeds)
  const ocrResults = await runOcrBenchmark(ocrFixtures)
  const summary = buildSummary(barcodeResults, ocrResults)
  const result = {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    inputFingerprint: computeFoodTruthFingerprint({ fixturesRoot: fixturesDir }),
    summary,
    barcodeResults,
    ocrResults,
    failures: buildFailures(barcodeResults, ocrResults),
  }

  writeResults(result)

  console.log(
    `food-truth-benchmark: ${summary.barcodeFixtureCount} barcode fixtures, ${summary.ocrFixtureCount} OCR fixtures, lookup ${summary.barcodeLookupSuccessRate}%, identity ${summary.barcodeIdentityAccuracy}%, serving ${summary.servingBasisAccuracy}%, OCR serving ${summary.ocrServingBasisAccuracy}%, false autologs ${summary.falseAutologCount}.`,
  )
  writeSummary(
    `food-truth-benchmark: ${summary.barcodeFixtureCount} barcode fixtures, ${summary.ocrFixtureCount} OCR fixtures, lookup ${summary.barcodeLookupSuccessRate}%, identity ${summary.barcodeIdentityAccuracy}%, serving ${summary.servingBasisAccuracy}%, OCR serving ${summary.ocrServingBasisAccuracy}%, false autologs ${summary.falseAutologCount}.`,
  )

  if (!summary.passed) {
    fail('food-truth-benchmark: one or more benchmark thresholds failed.')
  }
}

main().catch((error) => {
  const bootstrapResult = fs.existsSync(manifestPath) ? null : createBootstrapResult()
  if (bootstrapResult) {
    writeResults(bootstrapResult)
  }
  console.error(error instanceof Error ? error.message : `${error}`)
  writeSummary(error instanceof Error ? error.message : `${error}`)
  process.exit(1)
})
