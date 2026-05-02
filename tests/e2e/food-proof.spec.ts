import { expect, test } from '@playwright/test'
import { ensureMealExpanded, goToLog, resetApp } from './helpers/app'
import { syncSeededPersistentStoresFromLocalStorage } from './helpers/seed'

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('food proof panel shows trusted calories, repair state, and audit count', async ({ page }) => {
  const today = todayKey()
  await page.evaluate((date) => {
    const trustedEntry = {
      id: 'entry-trusted',
      date,
      meal: 'breakfast',
      servings: 1,
      createdAt: `${date}T08:00:00.000Z`,
      snapshot: {
        name: 'Greek yogurt',
        servingSize: 170,
        servingUnit: 'g',
        calories: 100,
        protein: 17,
        carbs: 6,
        fat: 0,
        source: 'custom',
        trustEvidence: {
          source: 'custom',
          sourceId: 'entry-trusted',
          status: 'trusted',
          confidence: 1,
          servingBasis: 'verified',
          macroCompleteness: 'complete',
          providerConflict: false,
          reasons: [],
          proofEligible: true,
        },
      },
    }
    const reviewEntry = {
      id: 'entry-review',
      date,
      meal: 'breakfast',
      servings: 1,
      createdAt: `${date}T08:01:00.000Z`,
      needsReview: true,
      snapshot: {
        name: 'Imported bowl',
        servingSize: 1,
        servingUnit: 'serving',
        calories: 300,
        protein: 20,
        carbs: 35,
        fat: 10,
        source: 'custom',
        trustEvidence: {
          source: 'import',
          sourceId: 'entry-review',
          status: 'review_required',
          confidence: 0.7,
          servingBasis: 'inferred',
          macroCompleteness: 'complete',
          providerConflict: false,
          reasons: ['estimated_serving'],
          proofEligible: false,
        },
      },
    }
    window.localStorage.setItem(`mt_log_${date}`, JSON.stringify([trustedEntry, reviewEntry]))
    window.localStorage.setItem(
      'mt_food_audit_events',
      JSON.stringify([
        {
          id: 'audit-1',
          operationId: 'seed',
          entryId: 'entry-trusted',
          date,
          eventType: 'created',
          actor: 'user',
          after: {
            entryId: 'entry-trusted',
            date,
            meal: 'breakfast',
            servings: 1,
            name: 'Greek yogurt',
            servingSize: 170,
            servingUnit: 'g',
            calories: 100,
            protein: 17,
            carbs: 6,
            fat: 0,
            trustStatus: 'trusted',
          },
          issues: [],
          createdAt: `${date}T08:00:00.000Z`,
        },
        {
          id: 'audit-2',
          operationId: 'seed',
          entryId: 'entry-review',
          date,
          eventType: 'imported',
          actor: 'import',
          after: {
            entryId: 'entry-review',
            date,
            meal: 'breakfast',
            servings: 1,
            name: 'Imported bowl',
            servingSize: 1,
            servingUnit: 'serving',
            calories: 300,
            protein: 20,
            carbs: 35,
            fat: 10,
            trustStatus: 'review_required',
            needsReview: true,
          },
          issues: [],
          createdAt: `${date}T08:01:00.000Z`,
        },
      ]),
    )
  }, today)

  await syncSeededPersistentStoresFromLocalStorage(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await goToLog(page)

  await expect(page.getByTestId('food-proof-panel')).toBeVisible()
  await expect(page.getByTestId('food-proof-panel')).toContainText(/review needed before coaching proof/i)
  await expect(page.getByTestId('food-proof-panel')).toContainText(/100 cal/i)
  await expect(page.getByTestId('food-proof-panel')).toContainText(/2/)

  await ensureMealExpanded(page, 'breakfast')
  await expect(page.getByTestId('food-trust-status').filter({ hasText: 'Trusted' })).toBeVisible()
  await expect(page.getByTestId('food-trust-status').filter({ hasText: 'Review' })).toBeVisible()
})
