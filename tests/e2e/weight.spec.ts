import { expect, test } from '@playwright/test'
import {
  expectCenterHittable,
  getSettingsCalorieTargetInput,
  goToSettings,
  goToWeight,
  resetApp,
  safeClick,
  safeFill,
} from './helpers/app'
import {
  seedCoachWave1Scenario,
  seedWeeklyCheckInWindow,
  syncSeededPersistentStoresFromLocalStorage,
} from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('weight history converts instead of relabeling', async ({ page }) => {
  await goToWeight(page)
  await safeFill(page.getByLabel('Weight (lb)'), '200')
  await safeClick(page.getByRole('button', { name: /save today's weight/i }))
  await expect(page.getByText('200 lb').first()).toBeVisible()

  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /^kg$/i }))
  await safeClick(page.getByRole('button', { name: /save targets/i }))

  await goToWeight(page)
  await expect(page.getByText('90.72 kg').first()).toBeVisible()
})

test('weight clear offers undo', async ({ page }) => {
  await goToWeight(page)
  await safeFill(page.getByLabel('Weight (lb)'), '200')
  await safeClick(page.getByRole('button', { name: /save today's weight/i }))
  await safeClick(page.getByRole('button', { name: /clear today/i }))
  await expect(page.getByText(/weight cleared/i)).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^undo$/i }))
  await expect(page.getByText('200 lb').first()).toBeVisible()
})

test('S22 weight layout keeps weekly check-in actions readable on initial render', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)
  await goToWeight(page)

  await expect(page.getByText(/progress proof/i).first()).toBeVisible()
  await expect(page.getByText(/metrics and progress photos/i).first()).toBeVisible()
  await expect(page.getByText(/capture focus/i).first()).toBeVisible()
  await expectCenterHittable(page.getByRole('button', { name: /^settings$/i }).first())
})

test('weekly check-in can apply a ready calorie recommendation', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await goToWeight(page)

  const weeklyCheckInHeading = page.getByText('Weekly check-in').first()
  await weeklyCheckInHeading.scrollIntoViewIfNeeded()
  await expect(page.getByText(/rate of loss was slower than target/i).first()).toBeVisible()
  await expect(page.getByText(/2200 cal\/day/i)).toBeVisible()
  const applySuggestionButton = page.getByRole('button', { name: /apply suggestion/i })
  await safeClick(applySuggestionButton)
  await expect(page.getByText(/applied/i).first()).toBeVisible()

  await goToSettings(page)
  await expect(getSettingsCalorieTargetInput(page)).toHaveValue('2200')
  await expect(page.getByLabel(/Carbs \(g\)/i)).toHaveValue('220')
})

test('body progress metrics can be saved from the weight screen', async ({ page }) => {
  await goToWeight(page)

  await safeFill(page.getByLabel(/Waist \(cm\)/i), '79')
  await safeFill(page.getByLabel(/Body fat \(%\)/i), '12')
  await safeClick(page.getByRole('button', { name: /save today's snapshot/i }))

  await expect(page.getByText(/recent body progress/i)).toBeVisible()
  await expect(page.getByText(/waist: 79 cm/i)).toBeVisible()
  await expect(page.getByText(/body fat: 12 %/i)).toBeVisible()
})

test('body progress quick review keeps compare and capture pose together', async ({ page }) => {
  await goToWeight(page)

  await safeFill(page.getByLabel(/Waist \(cm\)/i), '79')
  await safeClick(page.getByRole('button', { name: /save today's snapshot/i }))

  await expect(page.getByText(/quick review/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^same_day$/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^7d$/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^30d$/i }).first()).toBeVisible()
  await expect(page.getByText('Waist trend', { exact: true })).toBeVisible()

  await page
    .locator('section')
    .filter({ hasText: 'Capture focus' })
    .getByRole('button', { name: /^back$/i })
    .first()
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })

  const settings = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}'))
  expect(settings.bodyProgressFocusState?.lastSelectedPose).toBe('back')
  await page.reload()

  const reloadedSettings = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}'))
  expect(reloadedSettings.bodyProgressFocusState?.lastSelectedPose).toBe('back')
})

test('nutrition intelligence v2 shows long-window alerts and contributors', async ({ page }) => {
  await page.evaluate(() => {
    const today = new Date()
    const formatDateKey = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

    const todayKey = formatDateKey(today)
    const priorDate = new Date(today)
    priorDate.setDate(today.getDate() - 3)
    const priorKey = formatDateKey(priorDate)

    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    window.localStorage.setItem(
      'mt_settings',
      JSON.stringify({
        ...settings,
        coachingEnabled: true,
      }),
    )

    const fishLog = {
      id: `nutrition-${todayKey}-fish`,
      foodId: 'lean-fish',
      date: todayKey,
      meal: 'breakfast',
      servings: 1,
      createdAt: `${todayKey}T08:00:00.000Z`,
      updatedAt: `${todayKey}T08:00:00.000Z`,
      snapshot: {
        name: 'Lean Fish',
        brand: 'Test Catch',
        servingSize: 1,
        servingUnit: 'entry',
        calories: 700,
        protein: 90,
        carbs: 0,
        fat: 20,
        source: 'custom',
        nutrients: {
          basis: 'serving',
          values: {
            fiber: { key: 'fiber', unit: 'g', value: 3 },
            vitaminD: { key: 'vitaminD', unit: 'mcg', value: 2 },
            calcium: { key: 'calcium', unit: 'mg', value: 140 },
          },
        },
      },
    }

    const greensLog = {
      id: `nutrition-${todayKey}-greens`,
      foodId: 'greens',
      date: todayKey,
      meal: 'lunch',
      servings: 1,
      createdAt: `${todayKey}T12:00:00.000Z`,
      updatedAt: `${todayKey}T12:00:00.000Z`,
      snapshot: {
        name: 'Greens',
        brand: 'Garden Test',
        servingSize: 1,
        servingUnit: 'entry',
        calories: 300,
        protein: 10,
        carbs: 20,
        fat: 5,
        source: 'custom',
        nutrients: {
          basis: 'serving',
          values: {
            fiber: { key: 'fiber', unit: 'g', value: 3 },
            vitaminC: { key: 'vitaminC', unit: 'mg', value: 20 },
          },
        },
      },
    }

    window.localStorage.setItem(`mt_log_${todayKey}`, JSON.stringify([fishLog, greensLog]))
    window.localStorage.setItem(
      `mt_log_${priorKey}`,
      JSON.stringify([
        {
          ...greensLog,
          id: `nutrition-${priorKey}-greens`,
          date: priorKey,
          createdAt: `${priorKey}T12:00:00.000Z`,
          updatedAt: `${priorKey}T12:00:00.000Z`,
        },
      ]),
    )
    window.localStorage.setItem(
      'mt_day_meta',
      JSON.stringify([
        { date: todayKey, status: 'complete', updatedAt: `${todayKey}T09:00:00.000Z` },
        { date: priorKey, status: 'complete', updatedAt: `${priorKey}T09:00:00.000Z` },
      ]),
    )
  })

  await syncSeededPersistentStoresFromLocalStorage(page)
  await page.reload()

  await goToWeight(page)

  await expect(page.getByText(/nutrition intelligence/i)).toBeVisible()
  await expect(page.getByText(/30-day average/i)).toBeVisible()
  await expect(page.getByText(/deficiency alerts/i).first()).toBeVisible()
  await expect(page.getByText(/top contributors/i).first()).toBeVisible()
  await expect(page.getByText(/lean fish/i).first()).toBeVisible()
})
