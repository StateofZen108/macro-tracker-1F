import { test } from '@playwright/test'
import {
  runBarcodeExactAutologScenario,
  runBarcodeWeakBasisReviewScenario,
  runDiagnosticsReviewScenario,
  runOcrAmbiguousServingBlockedScenario,
  runOcrExplicitServingReviewScenario,
} from '../helpers/foodTruth'

test('barcodeExactAutolog', async ({ page }) => {
  await runBarcodeExactAutologScenario(page)
})

test('barcodeWeakBasisReview', async ({ page }) => {
  await runBarcodeWeakBasisReviewScenario(page)
})

test('ocrExplicitServingReview', async ({ page }) => {
  await runOcrExplicitServingReviewScenario(page)
})

test('ocrAmbiguousServingBlocked', async ({ page }) => {
  await runOcrAmbiguousServingBlockedScenario(page)
})

test('diagnosticsReview', async ({ page }) => {
  test.setTimeout(60000)
  await runDiagnosticsReviewScenario(page)
})
