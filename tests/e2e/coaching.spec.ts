import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  ensureMealExpanded,
  entryRow,
  goToWeight,
  resetApp,
  safeClick,
  safeFill,
  safeSelectOption,
} from './helpers/app'
import {
  seedCoachingWindow,
  seedWeeklyCheckInWindow,
  syncSeededPersistentStoresFromLocalStorage,
} from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('coaching stays gated on sparse data', async ({ page }) => {
  await seedCoachingWindow(page, {
    loggedDays: 10,
    weighInDays: 4,
  })

  await expect(
    page.getByText(/hold current targets until the data window is strong enough to act on/i).first(),
  ).toBeVisible()
  await expect(page.getByText(/confidence score/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeHidden()
})

test('coaching shows a recommendation only with consistent data', async ({ page }) => {
  await seedCoachingWindow(page, {
    loggedDays: 21,
    weighInDays: 14,
    markCompleteDays: true,
  })

  await expect(page.getByText('21/21').first()).toBeVisible()
  await expect(page.getByText(/all-days target/i)).toBeVisible()
  await expect(page.getByText(/confidence score/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeVisible()
  await safeClick(page.getByRole('button', { name: /keep current/i }))
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeHidden()
})

test('manual override supersedes the active weekly recommendation window', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)
  await goToWeight(page)

  await safeClick(page.getByRole('button', { name: /manual override/i }))
  await safeFill(page.getByLabel(/^Calories$/i), '2100')
  await safeFill(page.getByLabel(/^Protein$/i), '190')
  await safeFill(page.getByLabel(/^Carbs$/i), '180')
  await safeFill(page.getByLabel(/^Fat$/i), '55')
  await safeClick(page.getByRole('button', { name: /save override/i }))

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const records = JSON.parse(window.localStorage.getItem('mt_checkin_history') ?? '[]')
        return records[0]?.status ?? null
      })
    })
    .toBe('overridden')
  await expect(page.getByText(/^overridden$/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)
  await expect(page.getByText(/^manual override$/i).first()).toBeVisible()

  const persistedStatus = await page.evaluate(() => {
    const records = JSON.parse(window.localStorage.getItem('mt_checkin_history') ?? '[]')
    return records[0]?.status ?? null
  })
  expect(persistedStatus).toBe('overridden')
})

test('weight screen renders the micronutrient overview for today and the trailing week', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)

  await page.evaluate(() => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`)
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
    const yesterday = yesterdayDate.toISOString().slice(0, 10)

    const nutrientProfile = {
      basis: 'serving',
      values: {
        fiber: { key: 'fiber', unit: 'g', value: 30 },
        sodium: { key: 'sodium', unit: 'mg', value: 1800 },
        potassium: { key: 'potassium', unit: 'mg', value: 4800 },
        calcium: { key: 'calcium', unit: 'mg', value: 1300 },
        magnesium: { key: 'magnesium', unit: 'mg', value: 430 },
        iron: { key: 'iron', unit: 'mg', value: 12 },
        vitaminC: { key: 'vitaminC', unit: 'mg', value: 100 },
        vitaminD: { key: 'vitaminD', unit: 'mcg', value: 20 },
        vitaminB12: { key: 'vitaminB12', unit: 'mcg', value: 3 },
      },
    }

    const makeEntry = (date: string, id: string) => ({
      id,
      date,
      meal: 'breakfast',
      servings: 1,
      createdAt: `${date}T08:00:00.000Z`,
      updatedAt: `${date}T08:00:00.000Z`,
      snapshot: {
        name: 'Micronutrient meal',
        servingSize: 1,
        servingUnit: 'entry',
        calories: 1200,
        protein: 180,
        carbs: 80,
        fat: 25,
        source: 'custom',
        nutrients: nutrientProfile,
      },
    })

    window.localStorage.setItem(`mt_log_${today}`, JSON.stringify([makeEntry(today, `micro-${today}`)]))
    window.localStorage.setItem(
      `mt_log_${yesterday}`,
      JSON.stringify([makeEntry(yesterday, `micro-${yesterday}`)]),
    )
    window.localStorage.setItem(
      'mt_day_meta',
      JSON.stringify([
        { date: today, status: 'complete', updatedAt: `${today}T09:00:00.000Z` },
        { date: yesterday, status: 'complete', updatedAt: `${yesterday}T09:00:00.000Z` },
      ]),
    )
  })

  await syncSeededPersistentStoresFromLocalStorage(page)
  await page.reload()
  await goToWeight(page)

  await expect(page.getByText(/nutrition overview/i).first()).toBeVisible()
  await expect(page.getByText(/7-day average/i).first()).toBeVisible()
  await expect(page.getByText(/vitamin b12/i).first()).toBeVisible()
  await expect(page.getByText(/adequate/i).first()).toBeVisible()
})

test('fasting day requires explicit confirmation before clearing intake', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const fastingButton = page.getByRole('button', { name: /^fasting$/i })
  await safeClick(fastingButton)

  await expect(page.getByRole('heading', { name: /clear intake and mark fasting/i })).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^clear intake and mark fasting$/i }))

  await expect(entryRow(page, 'Banana')).toBeHidden()
  await expect(page.getByText(/fasting day saved/i)).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^undo$/i }))
  await ensureMealExpanded(page)
  await expect(entryRow(page, 'Banana')).toBeVisible()
})

test('interventions can be logged and edited from the log screen', async ({ page }) => {
  const logInterventionButton = page.getByRole('button', { name: /log your first intervention/i })
  await safeClick(logInterventionButton)
  const interventionSheet = page.getByRole('dialog', { name: /log intervention/i })
  await safeFill(interventionSheet.getByLabel('Name'), 'Caffeine')
  await safeClick(interventionSheet.getByRole('button', { name: /^stimulant$/i }))
  await safeFill(interventionSheet.getByLabel('Dose'), '200')
  await safeFill(interventionSheet.getByLabel('Unit'), 'mg')
  await safeFill(interventionSheet.getByLabel('Time taken'), '08:00')
  await safeClick(interventionSheet.getByRole('button', { name: /log intervention/i }))

  await expect(page.getByText(/caffeine/i).first()).toBeVisible()
  await safeClick(page.getByRole('button', { name: /200 mg/i }).first())
  const editInterventionSheet = page.getByRole('dialog', { name: /edit intervention/i })
  await safeFill(editInterventionSheet.getByLabel('Dose'), '250')
  await safeClick(editInterventionSheet.getByRole('button', { name: /save intervention/i }))

  await expect(page.getByText(/250 mg/i).first()).toBeVisible()
})

test('activity can be logged and cleared from the log screen', async ({ page }) => {
  const stepsInput = page.locator('input[name="steps"]')
  const cardioMinutesInput = page.locator('input[name="cardioMinutes"]')

  await safeFill(stepsInput, '9000')
  await safeFill(cardioMinutesInput, '35')
  await safeSelectOption(page.getByLabel('Cardio type'), 'walk')
  await safeFill(page.getByLabel('Note'), 'Post-workout walk')
  await safeClick(page.getByRole('button', { name: /save activity/i }))

  await expect(page.getByText(/logged for this day/i)).toBeVisible()
  await expect(stepsInput).toHaveValue('9000')
  await expect(cardioMinutesInput).toHaveValue('35')

  await safeClick(page.getByRole('button', { name: /clear activity/i }))
  await expect(page.getByText(/not logged yet/i)).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^undo$/i }))
  await expect(stepsInput).toHaveValue('9000')
})
