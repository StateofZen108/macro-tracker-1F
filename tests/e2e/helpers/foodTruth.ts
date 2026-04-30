import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import type { BarcodeLookupResult, Food, FoodLogEntry, UserSettings } from '../../../src/types.ts'
import { buildSessionFromProviderPayload } from '../../../src/utils/labelOcrPayload.ts'
import {
  getAddFoodDialog,
  getSelectedFoodCard,
  getSelectedFoodServingMeta,
  goToLog,
  openMealSheet,
  resetApp,
} from './app.ts'

type BarcodeFixture = {
  id: string
  barcode: string
  productSlug: string
  expectedName: string
  expectedBrand?: string
  expectedTrustLevel: 'exact_autolog' | 'exact_review' | 'blocked'
  expectedServingBasis: 'serving' | '100g' | '100ml' | 'unknown'
  expectedServingBasisSource: string
  expectedNutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber?: number
  }
  expectedProvider?: 'fatsecret' | 'open_food_facts' | 'usda_fdc'
  expectedRemoteKey?: string
  localStateSeedId?: string
}

type OcrFixture = {
  id: string
  imageFile: string
  productSlug: string
  expectedName: string
  expectedBrand?: string
  expectedTrustLevel: 'exact_autolog' | 'exact_review' | 'blocked'
  expectedServingBasis: 'serving' | '100g' | '100ml' | 'unknown'
  expectedServingBasisSource: string
  expectedNutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber?: number
  }
  ocrReplayFile: string
  reviewSelection: {
    interpretationId: string
    kind: 'explicit_metric' | 'container_metric' | 'per100_metric' | 'manual'
    manualServingSize?: number
    manualServingUnit?: string
  }
}

type SeedFixture = {
  id: string
  purpose: string
  food: Food
}

export type Wave1AcceptanceScenarioId =
  | 'barcodeExactAutolog'
  | 'barcodeWeakBasisReview'
  | 'ocrExplicitServingReview'
  | 'ocrAmbiguousServingBlocked'
  | 'diagnosticsReview'

const repoRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const barcodeFixturePath = path.join(fixturesDir, 'barcode.real-world.json')
const ocrFixturePath = path.join(fixturesDir, 'ocr.real-world.json')
const seedFixturePath = path.join(fixturesDir, 'local-state-seeds.json')
const ocrReplayDir = path.join(fixturesDir, 'provider-replays', 'gemini', 'ocr')
const ocrImageDir = path.join(fixturesDir, 'ocr-images')

let fixtureCache:
  | {
      barcodeFixtures: BarcodeFixture[]
      ocrFixtures: OcrFixture[]
      seeds: SeedFixture[]
    }
  | null = null

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function getFixtures() {
  if (!fixtureCache) {
    fixtureCache = {
      barcodeFixtures: readJson<BarcodeFixture[]>(barcodeFixturePath),
      ocrFixtures: readJson<OcrFixture[]>(ocrFixturePath),
      seeds: readJson<SeedFixture[]>(seedFixturePath),
    }
  }
  return fixtureCache
}

function getLocalBarcodeFixture() {
  const { barcodeFixtures, seeds } = getFixtures()
  const fixture = barcodeFixtures.find(
    (entry) => entry.localStateSeedId && !entry.expectedProvider,
  )
  if (!fixture?.localStateSeedId) {
    throw new Error('food-truth-wave1: missing local barcode fixture.')
  }

  const seed = seeds.find((entry) => entry.id === fixture.localStateSeedId)
  if (!seed) {
    throw new Error(`food-truth-wave1: missing local seed "${fixture.localStateSeedId}".`)
  }

  return { fixture, seed }
}

function getWeakBasisBarcodeFixture() {
  const { barcodeFixtures } = getFixtures()
  const fixture = barcodeFixtures.find(
    (entry) =>
      !entry.localStateSeedId &&
      (entry.expectedServingBasis === '100g' || entry.expectedServingBasis === '100ml'),
  )
  if (!fixture) {
    throw new Error('food-truth-wave1: missing weak-basis barcode fixture.')
  }
  return fixture
}

function getPantryExplicitOcrFixture() {
  const { ocrFixtures } = getFixtures()
  const fixture = ocrFixtures.find(
    (entry) =>
      !entry.id.endsWith('hard-case') && entry.reviewSelection.interpretationId === 'explicit_metric',
  )
  if (!fixture) {
    throw new Error('food-truth-wave1: missing pantry explicit OCR fixture.')
  }
  return fixture
}

function getHardCaseManualOcrFixture() {
  const { ocrFixtures } = getFixtures()
  const fixture = ocrFixtures.find((entry) => entry.id === 'ocr-020-troublesome-manual-hard-case')
  if (!fixture) {
    throw new Error('food-truth-wave1: missing retained manual OCR hard case fixture.')
  }
  return fixture
}

function buildBarcodeLookupPayload(fixture: BarcodeFixture): BarcodeLookupResult {
  const nutritionBasis = fixture.expectedServingBasis
  const servingSize =
    nutritionBasis === '100g' ? 100 : nutritionBasis === '100ml' ? 100 : 1
  const servingUnit =
    nutritionBasis === '100g' ? 'g' : nutritionBasis === '100ml' ? 'ml' : 'serving'
  const blockingIssues =
    fixture.expectedServingBasis === '100g' || fixture.expectedServingBasis === '100ml'
      ? ['per100_fallback']
      : fixture.expectedTrustLevel === 'blocked'
        ? ['unknown_serving_basis']
        : []

  return {
    candidate: {
      provider: fixture.expectedProvider ?? 'open_food_facts',
      remoteKey: fixture.expectedRemoteKey,
      barcode: fixture.barcode,
      name: fixture.expectedName,
      brand: fixture.expectedBrand,
      servingSize,
      servingUnit,
      calories: fixture.expectedNutrition.calories,
      protein: fixture.expectedNutrition.protein,
      carbs: fixture.expectedNutrition.carbs,
      fat: fixture.expectedNutrition.fat,
      fiber: fixture.expectedNutrition.fiber,
      source: 'api',
      verification: fixture.expectedTrustLevel === 'exact_autolog' ? 'verified' : 'needsConfirmation',
      nutritionBasis,
      importTrust: {
        level: fixture.expectedTrustLevel,
        servingBasis: fixture.expectedServingBasis,
        servingBasisSource: fixture.expectedServingBasisSource as BarcodeLookupResult['candidate']['importTrust']['servingBasisSource'],
        blockingIssues: blockingIssues as BarcodeLookupResult['candidate']['importTrust']['blockingIssues'],
      },
      importConfidence: fixture.expectedTrustLevel === 'exact_autolog' ? 'direct_match' : 'weak_match',
      sourceQuality: fixture.expectedTrustLevel === 'exact_autolog' ? 'high' : 'medium',
      note: blockingIssues.includes('per100_fallback')
        ? `Using ${fixture.expectedServingBasis} nutrition because serving data was incomplete.`
        : undefined,
    },
    missingFields: [],
    providerFailures: [],
  }
}

function buildOcrApiResponse(fixture: OcrFixture) {
  const replay = readJson<{ fixtureId: string; provider: string; payload: Record<string, unknown> }>(
    path.join(ocrReplayDir, fixture.ocrReplayFile),
  )
  if (replay.fixtureId !== fixture.id || replay.provider !== 'gemini') {
    throw new Error(`food-truth-wave1: invalid OCR replay for ${fixture.id}.`)
  }

  const session = buildSessionFromProviderPayload(replay.payload)
  if (!session) {
    throw new Error(`food-truth-wave1: could not build OCR session for ${fixture.id}.`)
  }

  return {
    ...replay.payload,
    session,
  }
}

function getOcrImagePath(fixture: OcrFixture): string {
  return path.join(ocrImageDir, fixture.imageFile)
}

async function safeUnroute(page: Page, routePattern: string) {
  await page.unroute(routePattern).catch(() => undefined)
}

async function seedFoodTruthState(
  page: Page,
  input: {
    foods: Food[]
    settings?: Partial<UserSettings>
    logsByDate?: Record<string, FoodLogEntry[]>
  },
) {
  await page.evaluate(async ({ foods, settings, logsByDate }) => {
    const currentSettings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    const nextSettings = {
      ...currentSettings,
      ...settings,
    }

    window.localStorage.setItem('mt_schema_version', '7')
    window.localStorage.setItem('mt_foods', JSON.stringify(foods))
    window.localStorage.setItem('mt_settings', JSON.stringify(nextSettings))

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mt_log_')) {
        window.localStorage.removeItem(key)
      }
    }

    for (const [dateKey, entries] of Object.entries(logsByDate ?? {})) {
      window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify(entries))
    }

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('macrotracker-storage', 2)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const storeName of [
          'meta',
          'foods',
          'settings',
          'weights',
          'mealTemplates',
          'wellness',
          'recoveryCheckIns',
          'dietPhases',
          'dietPhaseEvents',
          'logs',
          'diagnostics',
        ]) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName)
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Unable to seed food-truth state.'))
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['foods', 'settings', 'logs'], 'readwrite')
      transaction.objectStore('foods').put(foods, 'default')
      transaction.objectStore('settings').put(nextSettings, 'default')
      const logStore = transaction.objectStore('logs')
      const clearRequest = logStore.clear()
      clearRequest.onerror = () => reject(clearRequest.error ?? new Error('Unable to clear seeded logs.'))
      clearRequest.onsuccess = () => {
        for (const [dateKey, entries] of Object.entries(logsByDate ?? {})) {
          logStore.put(entries, dateKey)
        }
      }
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to seed food-truth state.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to seed food-truth state.'))
    })
  }, input)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await goToLog(page)
  await expect(page.locator('[data-meal-section="breakfast"]').first()).toBeVisible({ timeout: 10000 })
}

async function openBarcodeScanner(page: Page) {
  await openMealSheet(page)
  const addFoodDialog = getAddFoodDialog(page)
  const scannerButton = addFoodDialog.getByRole('button', { name: /scan barcode/i })
  if (!(await scannerButton.isVisible().catch(() => false))) {
    const expandButton = addFoodDialog.getByRole('button', { name: /more ways to log/i })
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click()
    }
  }
  await scannerButton.click()
  await expect(addFoodDialog.getByText(/manual barcode entry/i)).toBeVisible()
}

async function runManualBarcodeLookup(page: Page, barcode: string) {
  const input = getAddFoodDialog(page).getByPlaceholder('0123456789012')
  await expect(input).toBeVisible()
  await input.click()
  await page.keyboard.type(barcode)
  await page.getByRole('button', { name: /lookup barcode/i }).click()
}

async function openOcrCapture(page: Page) {
  await openMealSheet(page)
  const addFoodDialog = getAddFoodDialog(page)
  const ocrButton = addFoodDialog.getByRole('button', { name: /scan nutrition label/i })
  if (!(await ocrButton.isVisible().catch(() => false))) {
    const expandButton = addFoodDialog.getByRole('button', { name: /more ways to log/i })
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click()
    }
  }
  await ocrButton.click()
  await expect(addFoodDialog.getByRole('button', { name: /review nutrition label/i })).toBeVisible()
}

async function closeAddFoodSheet(page: Page) {
  const addFoodDialog = getAddFoodDialog(page)
  if (!(await addFoodDialog.isVisible().catch(() => false))) {
    return
  }

  await addFoodDialog.getByRole('button', { name: /close sheet/i }).click()
  const discardButton = page.getByRole('button', { name: /^discard$/i })
  if (await discardButton.isVisible().catch(() => false)) {
    await discardButton.click()
  }
  await expect(addFoodDialog).toBeHidden()
}

async function performWeakBasisBarcodeFlow(page: Page) {
  const fixture = getWeakBasisBarcodeFixture()
  const routePattern = `**/api/food-catalog/barcode?barcode=${fixture.barcode}`
  await page.route(routePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildBarcodeLookupPayload(fixture)),
    })
  })

  try {
    await openBarcodeScanner(page)
    await runManualBarcodeLookup(page, fixture.barcode)
    await expect(page.getByText(fixture.expectedName)).toBeVisible()
    await expect(page.getByText(new RegExp(`Basis: ${fixture.expectedServingBasis}`, 'i'))).toBeVisible()
    await expect(page.getByRole('button', { name: /review and save|fix and save/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /scan and log 1x/i })).toHaveCount(0)
    await expect(page.getByText(/review serving|review required|manual review required/i).first()).toBeVisible()
  } finally {
    await safeUnroute(page, routePattern)
  }
}

async function performExplicitOcrFlow(page: Page) {
  const fixture = getPantryExplicitOcrFixture()
  const responseBody = buildOcrApiResponse(fixture)
  const routePattern = '**/api/label-ocr/extract'
  await page.route(routePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  try {
    await openOcrCapture(page)
    const addFoodSheet = getAddFoodDialog(page)
    await addFoodSheet.getByTestId('ocr-gallery-input').setInputFiles(getOcrImagePath(fixture))
    await addFoodSheet.getByRole('button', { name: /review nutrition label/i }).click()
    await expect(addFoodSheet.getByText(/review extracted label/i)).toBeVisible()
    await expect(addFoodSheet.getByLabel('Food name')).toHaveValue(fixture.expectedName)
    await expect(addFoodSheet.getByRole('button', { name: /save reviewed food/i })).toBeEnabled()
    await expect(addFoodSheet.getByText(/^serving basis$/i)).toBeVisible()
    await expect(addFoodSheet.getByRole('button', { name: /scan and log 1x/i })).toHaveCount(0)
  } finally {
    await safeUnroute(page, routePattern)
  }
}

async function performAmbiguousOcrFlow(page: Page) {
  const fixture = getHardCaseManualOcrFixture()
  const responseBody = buildOcrApiResponse(fixture)
  const routePattern = '**/api/label-ocr/extract'
  await page.route(routePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  try {
    await openOcrCapture(page)
    const addFoodSheet = getAddFoodDialog(page)
    await addFoodSheet.getByTestId('ocr-gallery-input').setInputFiles(getOcrImagePath(fixture))
    await addFoodSheet.getByRole('button', { name: /review nutrition label/i }).click()
    await expect(addFoodSheet.getByText(/review extracted label/i)).toBeVisible()
    await expect(addFoodSheet.getByText(/choose the correct serving basis before saving/i)).toBeVisible()
    await expect(addFoodSheet.getByText(/manual review required/i)).toBeVisible()
    await expect(addFoodSheet.getByRole('button', { name: /fix and save/i })).toBeDisabled()
  } finally {
    await safeUnroute(page, routePattern)
  }
}

export async function runBarcodeExactAutologScenario(page: Page) {
  const { fixture, seed } = getLocalBarcodeFixture()
  await resetApp(page)
  await seedFoodTruthState(page, {
    foods: [seed.food],
  })

  const routePattern = '**/api/food-catalog/barcode?**'
  await page.route(routePattern, async () => {
    throw new Error('food-truth-wave1: local barcode scenario unexpectedly hit remote lookup.')
  })

  try {
    await openBarcodeScanner(page)
    await runManualBarcodeLookup(page, fixture.barcode)
    const selectedFoodCard = getSelectedFoodCard(page)
    await expect(selectedFoodCard).toBeVisible()
    await expect(selectedFoodCard).toContainText(fixture.expectedName)
    if (fixture.expectedBrand) {
      await expect(selectedFoodCard).toContainText(fixture.expectedBrand)
    }
    await expect(getSelectedFoodServingMeta(page)).toContainText(
      `${seed.food.servingSize}${seed.food.servingUnit}`,
    )
    await expect(page.getByRole('button', { name: /add to meal/i })).toBeEnabled()
    await expect(page.getByRole('button', { name: /scan and log 1x/i })).toHaveCount(0)
  } finally {
    await safeUnroute(page, routePattern)
  }
}

export async function runBarcodeWeakBasisReviewScenario(page: Page) {
  await resetApp(page)
  await performWeakBasisBarcodeFlow(page)
}

export async function runOcrExplicitServingReviewScenario(page: Page) {
  await resetApp(page)
  await performExplicitOcrFlow(page)
}

export async function runOcrAmbiguousServingBlockedScenario(page: Page) {
  await resetApp(page)
  await performAmbiguousOcrFlow(page)
}

export async function runDiagnosticsReviewScenario(page: Page) {
  await resetApp(page)
  await performWeakBasisBarcodeFlow(page)
  await closeAddFoodSheet(page)
  await performExplicitOcrFlow(page)
  await closeAddFoodSheet(page)
  await performAmbiguousOcrFlow(page)
  await closeAddFoodSheet(page)
  const settingsButton = page
    .getByRole('button', { name: /^settings$/i })
    .filter({ hasNot: page.getByRole('dialog') })
    .first()
  await settingsButton.scrollIntoViewIfNeeded()
  await settingsButton.click({ force: true })
  await expect(page.getByText(/^diagnostics$/i)).toBeVisible()
  await expect(page.getByText(/^food truth$/i)).toBeVisible()
  await expect(page.getByText(/barcode and label trust signals/i)).toBeVisible()
  await expect(page.getByText(/Food truth alert:/i)).toHaveCount(0)
}

export const WAVE1_ACCEPTANCE_SCENARIOS: Array<{
  id: Wave1AcceptanceScenarioId
  run: (page: Page) => Promise<void>
}> = [
  {
    id: 'barcodeExactAutolog',
    run: runBarcodeExactAutologScenario,
  },
  {
    id: 'barcodeWeakBasisReview',
    run: runBarcodeWeakBasisReviewScenario,
  },
  {
    id: 'ocrExplicitServingReview',
    run: runOcrExplicitServingReviewScenario,
  },
  {
    id: 'ocrAmbiguousServingBlocked',
    run: runOcrAmbiguousServingBlockedScenario,
  },
  {
    id: 'diagnosticsReview',
    run: runDiagnosticsReviewScenario,
  },
]
