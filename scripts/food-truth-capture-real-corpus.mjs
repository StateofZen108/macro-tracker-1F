import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createPendingEngineeringAcceptance,
  createPendingWave1ManualAcceptance,
  createRealPantryCorpusStatus,
  engineeringAcceptancePath,
  manualAcceptancePath,
} from './food-truth-readiness-shared.mjs'

const repoRoot = process.cwd()
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const stageDir = path.join(repoRoot, 'tmp', 'food-truth-corpus-build')
const stageResultsPath = path.join(repoRoot, 'tmp', 'food-truth-corpus-build-results.json')
const candidateOutputPath = path.join(repoRoot, 'tmp', 'food-truth-candidates.json')
const requiredBarcodeCount = 30
const requiredPantryOcrCount = 15
const requiredTotalOcrCount = 20

function fail(message) {
  console.error(`food-truth-capture-real-corpus: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    backupPath: '',
    imagesDir: '',
    operator: '',
    deferBranchProtectionCheck: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--backup') {
      args.backupPath = path.resolve(`${argv[index + 1] ?? ''}`)
      index += 1
      continue
    }
    if (arg === '--images') {
      args.imagesDir = path.resolve(`${argv[index + 1] ?? ''}`)
      index += 1
      continue
    }
    if (arg === '--operator') {
      args.operator = `${argv[index + 1] ?? ''}`.trim()
      index += 1
      continue
    }
    if (arg === '--defer-branch-protection-check') {
      args.deferBranchProtectionCheck = true
      continue
    }
    fail(`unsupported argument "${arg}".`)
  }

  if (!args.backupPath) {
    fail('use --backup <absolute-path-to-backup.json>.')
  }
  if (!args.imagesDir) {
    fail('use --images <absolute-path-to-sanitized-image-folder>.')
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function normalizeBarcode(value) {
  return `${value ?? ''}`.replace(/\D/g, '')
}

function slugify(value) {
  return `${value ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'food'
}

function toIso(value) {
  const parsed = Date.parse(`${value ?? ''}`)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  if (result.error) {
    fail(result.error.message)
  }
  if ((result.status ?? 1) !== 0) {
    const stderr = `${result.stderr ?? ''}`.trim()
    const stdout = `${result.stdout ?? ''}`.trim()
    fail(stderr || stdout || `${command} ${args.join(' ')} failed.`)
  }
  return `${result.stdout ?? ''}`.trim()
}

function resolveOperator(explicitOperator) {
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
    // Ignore.
  }

  const envOperator = process.env.USERNAME?.trim() || process.env.USER?.trim()
  if (envOperator) {
    return envOperator
  }

  fail('operator name is required; use --operator or configure git user.name.')
}

function assertFixtureTreeClean() {
  const output = runChecked('git', ['status', '--porcelain', '--', 'tests/fixtures/food-truth'])
  if (output) {
    fail(`FIXTURE_TREE_DIRTY\n${output}`)
  }
}

function assertBackup(backupPath) {
  if (!path.isAbsolute(backupPath)) {
    fail('--backup must be an absolute path.')
  }
  if (!fs.existsSync(backupPath)) {
    fail(`backup file not found at ${backupPath}.`)
  }
  const backup = readJson(backupPath)
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    fail('backup file must contain an object.')
  }
  if (!Array.isArray(backup.foods) || !backup.logsByDate || typeof backup.logsByDate !== 'object') {
    fail('backup file does not match the expected BackupFile shape.')
  }
  if (!toIso(backup.exportedAt)) {
    fail('backup.exportedAt is missing or invalid.')
  }
  return backup
}

function assertImagesDir(imagesDir) {
  if (!path.isAbsolute(imagesDir)) {
    fail('--images must be an absolute path.')
  }
  if (!fs.existsSync(imagesDir) || !fs.statSync(imagesDir).isDirectory()) {
    fail(`sanitized OCR image folder not found at ${imagesDir}.`)
  }
}

function ensureBranchProtectionToken(deferBranchProtectionCheck) {
  if (!deferBranchProtectionCheck && !process.env.BRANCH_PROTECTION_ADMIN_TOKEN?.trim()) {
    fail('BRANCH_PROTECTION_ADMIN_TOKEN is required unless --defer-branch-protection-check is set.')
  }
}

function ensureOcrCaptureUrl() {
  const value = process.env.FOOD_TRUTH_OCR_CAPTURE_URL?.trim()
  if (!value) {
    fail('FOOD_TRUTH_OCR_CAPTURE_URL must point to the deployed /api/label-ocr/extract endpoint.')
  }
  let url
  try {
    url = new URL(value)
  } catch {
    fail('FOOD_TRUTH_OCR_CAPTURE_URL must be a valid absolute URL.')
  }
  if (!/\/api\/label-ocr\/extract$/i.test(url.pathname)) {
    fail('FOOD_TRUTH_OCR_CAPTURE_URL must end with /api/label-ocr/extract.')
  }
  return url.toString()
}

function buildImageMap(imagesDir) {
  const map = new Map()
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue
    }
    const extension = path.extname(entry.name).toLowerCase()
    if (!['.png', '.jpg', '.jpeg'].includes(extension)) {
      continue
    }
    const barcode = normalizeBarcode(path.basename(entry.name, extension))
    if (!barcode || map.has(barcode)) {
      continue
    }
    map.set(barcode, path.join(imagesDir, entry.name))
  }
  return map
}

function isActiveFood(food) {
  return Boolean(food && typeof food === 'object' && !food.archivedAt)
}

function runCandidateBuild(backupPath) {
  runChecked(process.execPath, ['scripts/food-truth-build-candidates.mjs', '--backup', backupPath], {
    env: process.env,
  })
  if (!fs.existsSync(candidateOutputPath)) {
    fail('candidate builder did not produce tmp/food-truth-candidates.json.')
  }
  const report = readJson(candidateOutputPath)
  if (!Array.isArray(report.barcodeCandidates)) {
    fail('candidate report does not include barcodeCandidates.')
  }
  return report
}

function reserveCandidates(report, foods) {
  const localBarcode = report.barcodeCandidates.find((candidate) =>
    foods.some((food) => isActiveFood(food) && normalizeBarcode(food.barcode) === candidate.barcode),
  )
  if (!localBarcode) {
    fail('missing highest-ranked exact local barcode candidate.')
  }

  const localRemoteReference = report.barcodeCandidates.find(
    (candidate) =>
      candidate.barcode !== localBarcode.barcode &&
      foods.some(
        (food) =>
          isActiveFood(food) &&
          normalizeBarcode(food.barcode) !== candidate.barcode &&
          Array.isArray(food.remoteReferences) &&
          food.remoteReferences.some((reference) => normalizeBarcode(reference.barcode) === candidate.barcode),
      ),
  )
  if (!localRemoteReference) {
    fail('missing highest-ranked exact local remote-reference candidate.')
  }

  return { localBarcode, localRemoteReference }
}

function selectBarcodeCandidates(report, reserved) {
  const selected = []
  const seen = new Set()
  for (const candidate of [reserved.localBarcode, reserved.localRemoteReference, ...report.barcodeCandidates]) {
    if (seen.has(candidate.barcode)) {
      continue
    }
    seen.add(candidate.barcode)
    selected.push(candidate)
    if (selected.length === requiredBarcodeCount) {
      break
    }
  }
  if (selected.length !== requiredBarcodeCount) {
    fail(`expected ${requiredBarcodeCount} barcode fixtures, found ${selected.length}.`)
  }
  return selected
}

function selectPantryOcrCandidates(barcodeCandidates, imageMap) {
  const selected = barcodeCandidates.filter((candidate) => imageMap.has(candidate.barcode)).slice(0, requiredPantryOcrCount)
  if (selected.length !== requiredPantryOcrCount) {
    fail(`expected ${requiredPantryOcrCount} OCR-capable barcode fixtures, found ${selected.length}.`)
  }
  return selected
}

function toSeedFood(food) {
  return {
    id: food.id,
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    ...(food.barcode ? { barcode: normalizeBarcode(food.barcode) } : {}),
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    ...(typeof food.fiber === 'number' ? { fiber: food.fiber } : {}),
    source: food.source,
    usageCount: food.usageCount ?? 0,
    createdAt: food.createdAt,
    ...(food.provider ? { provider: food.provider } : {}),
    ...(Array.isArray(food.remoteReferences) && food.remoteReferences.length
      ? {
          remoteReferences: food.remoteReferences.map((reference) => ({
            provider: reference.provider,
            remoteKey: reference.remoteKey,
            ...(reference.barcode ? { barcode: normalizeBarcode(reference.barcode) } : {}),
          })),
        }
      : {}),
    ...(food.importTrust
      ? {
          importTrust: {
            level: food.importTrust.level,
            servingBasis: food.importTrust.servingBasis,
            servingBasisSource: food.importTrust.servingBasisSource,
            blockingIssues: Array.isArray(food.importTrust.blockingIssues)
              ? [...food.importTrust.blockingIssues]
              : [],
            ...(food.importTrust.verifiedAt ? { verifiedAt: food.importTrust.verifiedAt } : {}),
          },
        }
      : {}),
    ...(food.lastUsedAt ? { lastUsedAt: food.lastUsedAt } : {}),
    ...(food.updatedAt ? { updatedAt: food.updatedAt } : {}),
  }
}

function buildReservedSeeds(barcodeCandidates, foods) {
  const barcodeFood = foods.find((food) => isActiveFood(food) && normalizeBarcode(food.barcode) === barcodeCandidates[0].barcode)
  const remoteReferenceFood = foods.find(
    (food) =>
      isActiveFood(food) &&
      normalizeBarcode(food.barcode) !== barcodeCandidates[1].barcode &&
      Array.isArray(food.remoteReferences) &&
      food.remoteReferences.some((reference) => normalizeBarcode(reference.barcode) === barcodeCandidates[1].barcode),
  )

  if (!barcodeFood || !remoteReferenceFood) {
    fail('could not resolve the reserved local precedence foods from backup.foods.')
  }

  return {
    seeds: [
      {
        id: `seed-${barcodeCandidates[0].id.replace(/^barcode-/, '')}`,
        purpose: 'Exact local barcode precedence benchmark.',
        food: toSeedFood(barcodeFood),
      },
      {
        id: `seed-${barcodeCandidates[1].id.replace(/^barcode-/, '')}`,
        purpose: 'Exact local remote-reference precedence benchmark.',
        food: toSeedFood(remoteReferenceFood),
      },
    ],
    seedIdsByBarcode: new Map([
      [barcodeCandidates[0].barcode, `seed-${barcodeCandidates[0].id.replace(/^barcode-/, '')}`],
      [barcodeCandidates[1].barcode, `seed-${barcodeCandidates[1].id.replace(/^barcode-/, '')}`],
    ]),
  }
}

function buildRequestKey(method, requestUrl) {
  const url = new URL(requestUrl)
  const sortedEntries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyDelta = leftKey.localeCompare(rightKey)
    return keyDelta !== 0 ? keyDelta : leftValue.localeCompare(rightValue)
  })
  const params = new URLSearchParams()
  for (const [key, value] of sortedEntries) {
    params.append(key, value)
  }
  const suffix = sortedEntries.length ? `?${params.toString()}` : ''
  return `${method.toUpperCase()} ${url.origin}${url.pathname}${suffix}`
}

function captureBarcodeLookup(barcode) {
  const fatsecretKey = buildRequestKey(
    'GET',
    `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?barcode=${barcode}&flag_default_serving=true&format=json&language=en&region=US`,
  )
  const openFoodFactsKey = buildRequestKey(
    'GET',
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
  )
  const inlineScript = `
    import path from 'node:path'
    import { pathToFileURL } from 'node:url'

    const repoRoot = ${JSON.stringify(repoRoot)}
    const barcode = process.argv[1]
    const allowedKeys = new Set([
      'POST https://oauth.fatsecret.com/connect/token',
      ${JSON.stringify(fatsecretKey)},
      ${JSON.stringify(openFoodFactsKey)},
    ])

    const normalizeKey = (method, requestUrl) => {
      const url = new URL(requestUrl)
      const sortedEntries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyDelta = leftKey.localeCompare(rightKey)
        return keyDelta !== 0 ? keyDelta : leftValue.localeCompare(rightValue)
      })
      const params = new URLSearchParams()
      for (const [key, value] of sortedEntries) {
        params.append(key, value)
      }
      const suffix = sortedEntries.length ? \`?\${params.toString()}\` : ''
      return \`\${method.toUpperCase()} \${url.origin}\${url.pathname}\${suffix}\`
    }

    for (const [key, value] of Object.entries({
      MODE: 'test',
      NODE_ENV: 'test',
      VITE_FF_IMPORT_TRUST_V1: 'true',
      VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
      VITE_FF_LABEL_OCR_TRUST_V1: 'true',
      VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'true',
    })) {
      process.env[key] = value
    }

    const originalFetch = global.fetch.bind(global)
    const replayBuckets = new Map()

    global.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === 'string' || input instanceof URL ? \`\${input}\` : input.url
      const method =
        init.method ??
        (typeof input === 'object' && input !== null && 'method' in input ? input.method : 'GET')
      const requestKey = normalizeKey(method, requestUrl)
      if (!allowedKeys.has(requestKey)) {
        throw new Error(\`UNEXPECTED_REPLAY_REQUEST: \${requestKey}\`)
      }

      const response = await originalFetch(input, init)
      const clone = response.clone()
      let body
      try {
        body = await clone.json()
      } catch {
        throw new Error(\`NON_JSON_REPLAY_RESPONSE: \${requestKey}\`)
      }
      const headers = {}
      for (const [key, value] of response.headers.entries()) {
        headers[key.toLowerCase()] = value
      }
      const existing = replayBuckets.get(requestKey) ?? []
      existing.push({ status: response.status, headers, body })
      replayBuckets.set(requestKey, existing)
      return response
    }

    const { lookupBarcodeProviders } = await import(pathToFileURL(path.join(repoRoot, 'server', 'food-catalog', 'providers.ts')).href)
    const result = await lookupBarcodeProviders(barcode)
    process.stdout.write(JSON.stringify({
      result,
      replays: [...replayBuckets.entries()].map(([requestKey, responses]) => ({ requestKey, responses })),
    }))
  `

  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', inlineScript, '--', barcode], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    fail(result.error.message)
  }
  if ((result.status ?? 1) !== 0) {
    fail(`${result.stderr || result.stdout || `barcode capture failed for ${barcode}`}`.trim())
  }
  return JSON.parse(result.stdout)
}

function writeCapturedReplays(capture, stageRoot, fixtureId, barcode) {
  const requestMap = new Map(capture.replays.map((entry) => [entry.requestKey, entry.responses]))
  const tokenKey = 'POST https://oauth.fatsecret.com/connect/token'
  const fatsecretKey = buildRequestKey(
    'GET',
    `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?barcode=${barcode}&flag_default_serving=true&format=json&language=en&region=US`,
  )
  const openFoodFactsKey = buildRequestKey(
    'GET',
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
  )
  const writeReplay = (filePath, requestKey, responses) => {
    if (!responses) {
      return
    }
    writeJson(filePath, {
      fixtureId,
      requestKey,
      responses,
    })
  }

  writeReplay(path.join(stageRoot, 'provider-replays', 'fatsecret', 'oauth', `${fixtureId}.json`), tokenKey, requestMap.get(tokenKey))
  writeReplay(path.join(stageRoot, 'provider-replays', 'fatsecret', 'barcode', `${fixtureId}.json`), fatsecretKey, requestMap.get(fatsecretKey))
  writeReplay(path.join(stageRoot, 'provider-replays', 'open-food-facts', 'barcode', `${fixtureId}.json`), openFoodFactsKey, requestMap.get(openFoodFactsKey))

  const provider = capture.result?.ok ? capture.result.data?.candidate?.provider : null
  if (provider === 'fatsecret' && (!requestMap.get(tokenKey) || !requestMap.get(fatsecretKey))) {
    fail(`capture for ${fixtureId} is missing required FatSecret replays.`)
  }
  if (provider === 'open_food_facts' && !requestMap.get(openFoodFactsKey)) {
    fail(`capture for ${fixtureId} is missing the required Open Food Facts replay.`)
  }
}

async function loadOcrHelpers() {
  const payloadModule = await import(pathToFileURL(path.join(repoRoot, 'src', 'utils', 'labelOcrPayload.ts')).href)
  const reviewModule = await import(pathToFileURL(path.join(repoRoot, 'src', 'utils', 'ocrReview.ts')).href)
  return {
    buildSessionFromProviderPayload: payloadModule.buildSessionFromProviderPayload,
    hydrateLabelReviewSession: reviewModule.hydrateLabelReviewSession,
    buildLabelReviewValues: reviewModule.buildLabelReviewValues,
    buildLabelReviewState: reviewModule.buildLabelReviewState,
    buildOcrDraftFromReview: reviewModule.buildOcrDraftFromReview,
  }
}

function buildImageDataUrl(imagePath) {
  const extension = path.extname(imagePath).toLowerCase()
  const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  const base64 = fs.readFileSync(imagePath).toString('base64')
  return `data:${mimeType};base64,${base64}`
}

async function captureOcrPayload(url, fixtureId, imagePath, helpers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      images: [{ role: 'panel', imageBase64: buildImageDataUrl(imagePath) }],
      expectedLocale: 'auto',
    }),
  })
  if (response.status !== 200) {
    fail(`OCR capture for ${fixtureId} returned HTTP ${response.status}.`)
  }
  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.error || !payload.candidate || !payload.fields) {
    fail(`OCR capture for ${fixtureId} returned an invalid payload.`)
  }
  const replay = {
    fixtureId,
    provider: 'gemini',
    payload: {
      candidate: payload.candidate,
      fields: payload.fields,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      ...(typeof payload.message === 'string' ? { message: payload.message } : {}),
    },
  }
  if (!helpers.buildSessionFromProviderPayload(replay.payload)) {
    fail(`OCR capture for ${fixtureId} did not build a valid review session.`)
  }
  return replay
}

function chooseOcrInterpretation(hydratedSession) {
  for (const interpretationId of ['explicit_metric', 'container_metric', 'per100_metric']) {
    const match = hydratedSession.servingInterpretations?.find((interpretation) => interpretation.id === interpretationId)
    if (match) {
      return match
    }
  }
  return null
}

function validateStagedCorpus() {
  runChecked(process.execPath, ['scripts/food-truth-update-benchmark.mjs'], {
    env: {
      ...process.env,
      ALLOW_FOOD_TRUTH_BENCHMARK_UPDATE: '1',
      FOOD_TRUTH_FIXTURES_DIR: stageDir,
    },
  })
  runChecked(process.execPath, ['scripts/food-truth-benchmark.mjs'], {
    env: {
      ...process.env,
      FOOD_TRUTH_FIXTURES_DIR: stageDir,
      FOOD_TRUTH_RESULTS_PATH: stageResultsPath,
    },
  })
}

function replaceCorpus(operator, backupExportedAt, deferBranchProtectionCheck) {
  fs.rmSync(fixturesDir, { recursive: true, force: true })
  fs.cpSync(stageDir, fixturesDir, { recursive: true })
  writeJson(
    path.join(fixturesDir, 'corpus-status.json'),
    createRealPantryCorpusStatus({
      operator,
      backupExportedAt,
      deferBranchProtectionCheck,
    }),
  )
  writeJson(engineeringAcceptancePath, createPendingEngineeringAcceptance())
  writeJson(manualAcceptancePath, createPendingWave1ManualAcceptance())
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertFixtureTreeClean()
  const operator = resolveOperator(args.operator)
  ensureBranchProtectionToken(args.deferBranchProtectionCheck)
  assertImagesDir(args.imagesDir)

  const backup = assertBackup(args.backupPath)
  const ocrCaptureUrl = ensureOcrCaptureUrl()
  const backupExportedAt = toIso(backup.exportedAt)
  const sourceWindowStart = new Date(Date.parse(backupExportedAt) - 90 * 24 * 60 * 60 * 1000).toISOString()
  const sourceWindowEnd = backupExportedAt
  const imageMap = buildImageMap(args.imagesDir)
  const report = runCandidateBuild(args.backupPath)
  const reserved = reserveCandidates(report, backup.foods)
  const selectedBarcodeCandidates = selectBarcodeCandidates(report, reserved)
  const selectedPantryOcrCandidates = selectPantryOcrCandidates(selectedBarcodeCandidates, imageMap)
  const { seeds, seedIdsByBarcode } = buildReservedSeeds(selectedBarcodeCandidates, backup.foods)
  const ocrHelpers = await loadOcrHelpers()
  const currentHardCaseFixtures = readJson(path.join(fixturesDir, 'ocr.real-world.json')).filter((fixture) => fixture.id.endsWith('hard-case'))
  const currentHardCaseManifest = readJson(path.join(fixturesDir, 'manifest.json')).filter(
    (entry) => entry.kind === 'ocr' && entry.source === 'manual_hard_case',
  )

  if (currentHardCaseFixtures.length !== 5 || currentHardCaseManifest.length !== 5) {
    fail('expected 5 retained hard-case OCR fixtures in the current corpus.')
  }

  fs.rmSync(stageDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(stageDir, 'ocr-images'), { recursive: true })

  for (const fixture of currentHardCaseFixtures) {
    fs.copyFileSync(
      path.join(fixturesDir, 'ocr-images', fixture.imageFile),
      path.join(stageDir, 'ocr-images', fixture.imageFile),
    )
    writeJson(
      path.join(stageDir, 'provider-replays', 'gemini', 'ocr', fixture.ocrReplayFile),
      readJson(path.join(fixturesDir, 'provider-replays', 'gemini', 'ocr', fixture.ocrReplayFile)),
    )
  }

  const barcodeFixtures = []
  const pantryOcrFixtures = []

  for (const [index, candidate] of selectedBarcodeCandidates.entries()) {
    const fixtureId = `barcode-${String(index + 1).padStart(3, '0')}-${slugify(`${candidate.brand ?? ''}-${candidate.name}`)}`
    const productSlug = slugify(`${candidate.brand ?? ''}-${candidate.name}`)
    const barcode = candidate.barcode
    const capture = captureBarcodeLookup(barcode)
    writeCapturedReplays(capture, stageDir, fixtureId, barcode)

    const localSeedId = seedIdsByBarcode.get(barcode)
    if (localSeedId) {
      const seed = seeds.find((entry) => entry.id === localSeedId)
      const matchedReference = seed.food.remoteReferences?.find((reference) => normalizeBarcode(reference.barcode) === barcode)
      barcodeFixtures.push({
        id: fixtureId,
        barcode,
        productSlug,
        expectedName: seed.food.name,
        ...(seed.food.brand ? { expectedBrand: seed.food.brand } : {}),
        expectedTrustLevel: seed.food.importTrust?.level ?? 'blocked',
        expectedServingBasis: seed.food.importTrust?.servingBasis ?? 'serving',
        expectedServingBasisSource: seed.food.importTrust?.servingBasisSource ?? 'manual_review',
        expectedNutrition: {
          calories: seed.food.calories,
          protein: seed.food.protein,
          carbs: seed.food.carbs,
          fat: seed.food.fat,
          ...(typeof seed.food.fiber === 'number' ? { fiber: seed.food.fiber } : {}),
        },
        ...(matchedReference?.provider ? { expectedProvider: matchedReference.provider } : {}),
        ...(matchedReference?.remoteKey ? { expectedRemoteKey: matchedReference.remoteKey } : {}),
        localStateSeedId: localSeedId,
      })
      continue
    }

    if (!capture.result?.ok || !capture.result.data?.candidate) {
      fail(`remote capture failed for ${fixtureId}: ${capture.result?.error?.message ?? 'unknown error'}.`)
    }
    const candidateResult = capture.result.data.candidate
    barcodeFixtures.push({
      id: fixtureId,
      barcode,
      productSlug,
      expectedName: candidateResult.name,
      ...(candidateResult.brand ? { expectedBrand: candidateResult.brand } : {}),
      expectedTrustLevel: candidateResult.importTrust?.level ?? 'blocked',
      expectedServingBasis: candidateResult.importTrust?.servingBasis ?? candidateResult.nutritionBasis ?? 'unknown',
      expectedServingBasisSource:
        candidateResult.importTrust?.servingBasisSource ??
        (candidateResult.nutritionBasis === '100g'
          ? 'per100g_fallback'
          : candidateResult.nutritionBasis === '100ml'
            ? 'per100ml_fallback'
            : 'provider_serving'),
      expectedNutrition: {
        calories: candidateResult.calories,
        protein: candidateResult.protein,
        carbs: candidateResult.carbs,
        fat: candidateResult.fat,
        ...(typeof candidateResult.fiber === 'number' ? { fiber: candidateResult.fiber } : {}),
      },
      ...(candidateResult.provider ? { expectedProvider: candidateResult.provider } : {}),
      ...(candidateResult.remoteKey ? { expectedRemoteKey: candidateResult.remoteKey } : {}),
    })
  }

  for (const [index, candidate] of selectedPantryOcrCandidates.entries()) {
    const fixtureId = `ocr-${String(index + 1).padStart(3, '0')}-${slugify(`${candidate.brand ?? ''}-${candidate.name}`)}`
    const imageSourcePath = imageMap.get(candidate.barcode)
    const extension = path.extname(imageSourcePath).toLowerCase()
    const imageFile = `${fixtureId}${extension === '.jpeg' ? '.jpg' : extension}`
    const replayFile = `${fixtureId}.json`
    const replay = await captureOcrPayload(ocrCaptureUrl, fixtureId, imageSourcePath, ocrHelpers)
    writeJson(path.join(stageDir, 'provider-replays', 'gemini', 'ocr', replayFile), replay)
    fs.copyFileSync(imageSourcePath, path.join(stageDir, 'ocr-images', imageFile))

    const session = ocrHelpers.buildSessionFromProviderPayload(replay.payload)
    const hydratedSession = ocrHelpers.hydrateLabelReviewSession(session)
    const interpretation = chooseOcrInterpretation(hydratedSession)
    if (!interpretation) {
      fail(`OCR fixture ${fixtureId} did not expose explicit_metric, container_metric, or per100_metric.`)
    }
    const values = ocrHelpers.buildLabelReviewValues(hydratedSession, interpretation.id)
    const reviewState = ocrHelpers.buildLabelReviewState(hydratedSession, values, interpretation.id, false)
    const reviewedDraft = ocrHelpers.buildOcrDraftFromReview(values, hydratedSession, interpretation.id)

    pantryOcrFixtures.push({
      id: fixtureId,
      imageFile,
      productSlug: slugify(`${candidate.brand ?? ''}-${candidate.name}`),
      expectedName: reviewedDraft.name,
      ...(reviewedDraft.brand ? { expectedBrand: reviewedDraft.brand } : {}),
      expectedTrustLevel: reviewedDraft.importTrust?.level ?? 'blocked',
      expectedServingBasis: reviewedDraft.importTrust?.servingBasis ?? 'unknown',
      expectedServingBasisSource: reviewedDraft.importTrust?.servingBasisSource ?? 'manual_review',
      expectedNutrition: {
        calories: reviewedDraft.calories,
        protein: reviewedDraft.protein,
        carbs: reviewedDraft.carbs,
        fat: reviewedDraft.fat,
        ...(typeof reviewedDraft.fiber === 'number' ? { fiber: reviewedDraft.fiber } : {}),
      },
      ocrReplayFile: replayFile,
      reviewSelection: {
        interpretationId: interpretation.id,
        kind: interpretation.kind,
      },
      ...(reviewState.topWarning ? { notes: reviewState.topWarning } : {}),
    })
  }

  if (pantryOcrFixtures.length + currentHardCaseFixtures.length !== requiredTotalOcrCount) {
    fail(`expected ${requiredTotalOcrCount} total OCR fixtures after retaining hard cases.`)
  }

  const manifest = [
    ...barcodeFixtures.map((fixture) => ({
      id: fixture.id,
      kind: 'barcode',
      productSlug: fixture.productSlug,
      source: 'local_history',
      barcode: fixture.barcode,
      ...(fixture.expectedProvider ? { expectedProvider: fixture.expectedProvider } : {}),
      ...(fixture.expectedRemoteKey ? { expectedRemoteKey: fixture.expectedRemoteKey } : {}),
      expectedTrustLevel: fixture.expectedTrustLevel,
      expectedServingBasis: fixture.expectedServingBasis,
      expectedServingBasisSource: fixture.expectedServingBasisSource,
      expectedNutrition: fixture.expectedNutrition,
      refreshedAt: backupExportedAt,
      sourceWindowStart,
      sourceWindowEnd,
    })),
    ...pantryOcrFixtures.map((fixture) => ({
      id: fixture.id,
      kind: 'ocr',
      productSlug: fixture.productSlug,
      source: 'local_history',
      imageFile: fixture.imageFile,
      expectedTrustLevel: fixture.expectedTrustLevel,
      expectedServingBasis: fixture.expectedServingBasis,
      expectedServingBasisSource: fixture.expectedServingBasisSource,
      expectedNutrition: fixture.expectedNutrition,
      refreshedAt: backupExportedAt,
      sourceWindowStart,
      sourceWindowEnd,
    })),
    ...currentHardCaseManifest,
  ]

  writeJson(path.join(stageDir, 'barcode.real-world.json'), barcodeFixtures)
  writeJson(path.join(stageDir, 'ocr.real-world.json'), [...pantryOcrFixtures, ...currentHardCaseFixtures])
  writeJson(path.join(stageDir, 'manifest.json'), manifest)
  writeJson(path.join(stageDir, 'local-state-seeds.json'), seeds)

  validateStagedCorpus()
  replaceCorpus(operator, backupExportedAt, args.deferBranchProtectionCheck)
  console.log('FOOD_TRUTH_REAL_CORPUS_CAPTURED')
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : `${error}`)
})
