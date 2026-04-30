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

test('review-required food is visible at the point of use and blocks harder-cut CTA', async ({ page }) => {
  const today = todayKey()
  await page.evaluate((date) => {
    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    window.localStorage.setItem(
      'mt_settings',
      JSON.stringify({
        ...settings,
        goalMode: 'lose',
        coachingEnabled: true,
        askCoachEnabled: true,
        shareInterventionsWithCoach: true,
      }),
    )
    window.localStorage.setItem(
      `mt_log_${date}`,
      JSON.stringify([
        {
          id: 'entry-review-required',
          date,
          meal: 'breakfast',
          servings: 1,
          createdAt: `${date}T08:00:00.000Z`,
          needsReview: true,
          snapshot: {
            name: 'Imported meal needing repair',
            servingSize: 1,
            servingUnit: 'serving',
            calories: 450,
            protein: 30,
            carbs: 40,
            fat: 12,
            source: 'custom',
            trustEvidence: {
              source: 'custom',
              sourceId: 'entry-review-required',
              status: 'review_required',
              confidence: 0.62,
              servingBasis: 'inferred',
              macroCompleteness: 'complete',
              providerConflict: false,
              reasons: ['estimated_serving'],
            },
          },
        },
      ]),
    )
    window.localStorage.setItem(
      'mt_weights',
      JSON.stringify([
        {
          id: `weight-${date}`,
          date,
          weight: 200,
          unit: 'lb',
          createdAt: `${date}T07:00:00.000Z`,
        },
      ]),
    )
    window.localStorage.setItem(
      'mt_day_meta',
      JSON.stringify([{ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` }]),
    )
  }, today)

  await syncSeededPersistentStoresFromLocalStorage(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await goToLog(page)

  await expect(page.getByTestId('daily-guardrail-strip')).toBeVisible()
  await expect(page.getByTestId('daily-guardrail-primary')).toContainText(/repair food trust/i)

  await ensureMealExpanded(page, 'breakfast')
  await expect(page.getByTestId('trust-repair-chip')).toContainText(/serving basis/i)
  await expect(page.getByTestId('cut-os-primary-action')).toHaveCount(0)
})
