import { expect, test } from '@playwright/test'
import {
  expectCenterHittable,
  getSettingsCalorieTargetInput,
  goToSettings,
  goToWeight,
  resetApp,
} from './helpers/app'
import { seedWeeklyCheckInWindow } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('weight history converts instead of relabeling', async ({ page }) => {
  await goToWeight(page)
  await page.getByLabel('Weight (lb)').fill('200')
  await page.getByRole('button', { name: /save today's weight/i }).click()
  await expect(page.getByText('200 lb').first()).toBeVisible()

  await goToSettings(page)
  await page.getByRole('button', { name: /^kg$/i }).click()
  await page.getByRole('button', { name: /save targets/i }).click()

  await goToWeight(page)
  await expect(page.getByText('90.72 kg').first()).toBeVisible()
})

test('weight clear offers undo', async ({ page }) => {
  await goToWeight(page)
  await page.getByLabel('Weight (lb)').fill('200')
  await page.getByRole('button', { name: /save today's weight/i }).click()
  await page.getByRole('button', { name: /clear today/i }).click()
  await expect(page.getByText(/weight cleared/i)).toBeVisible()
  await page.getByRole('button', { name: /^undo$/i }).click()
  await expect(page.getByText('200 lb').first()).toBeVisible()
})

test('S22 weight layout keeps weekly check-in actions readable on initial render', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)
  await goToWeight(page)

  await expect(page.getByText('Weekly check-in').first()).toBeVisible()
  await expect(page.getByText(/rate of loss was slower than target/i).first()).toBeVisible()
  await expect(page.getByText(/recommendation evidence/i).first()).toBeVisible()
  await expect(page.getByText(/estimated tdee/i).first()).toBeVisible()
  await expectCenterHittable(page.getByRole('button', { name: /apply suggestion/i }))
  await expectCenterHittable(page.getByRole('button', { name: /keep current/i }))
})

test('weekly check-in can apply an athlete prep recommendation', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)
  await goToWeight(page)

  await expect(page.getByText(/rate of loss was slower than target/i).first()).toBeVisible()
  await expect(page.getByText(/1900 cal\/day/i)).toBeVisible()
  await page.getByRole('button', { name: /apply suggestion/i }).click()
  await expect(page.getByText(/applied/i).first()).toBeVisible()

  await goToSettings(page)
  await expect(getSettingsCalorieTargetInput(page)).toHaveValue('1900')
  await expect(page.getByLabel(/Carbs \(g\)/i)).toHaveValue('175')
})

test('body progress metrics can be saved from the weight screen', async ({ page }) => {
  await goToWeight(page)

  await page.getByLabel(/Waist \(cm\)/i).fill('79')
  await page.getByLabel(/Body fat \(%\)/i).fill('12')
  await page.getByRole('button', { name: /save today's snapshot/i }).click()

  await expect(page.getByText(/recent body progress/i)).toBeVisible()
  await expect(page.getByText(/waist: 79 cm/i)).toBeVisible()
  await expect(page.getByText(/body fat: 12 %/i)).toBeVisible()
})

test('body progress quick review keeps compare and capture pose together', async ({ page }) => {
  await goToWeight(page)

  await page.getByLabel(/Waist \(cm\)/i).fill('79')
  await page.getByRole('button', { name: /save today's snapshot/i }).click()

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
    .click()

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

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.deleteDatabase('macrotracker-storage')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()

  await goToWeight(page)

  await expect(page.getByText(/nutrition intelligence/i)).toBeVisible()
  await expect(page.getByText(/30-day average/i)).toBeVisible()
  await expect(page.getByText(/deficiency alerts/i).first()).toBeVisible()
  await expect(page.getByText(/top contributors/i).first()).toBeVisible()
  await expect(page.getByText(/lean fish/i).first()).toBeVisible()
})
