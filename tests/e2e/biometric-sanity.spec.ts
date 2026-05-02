import { expect, test } from '@playwright/test'
import { goToWeight, resetApp, safeClick, safeFill } from './helpers/app'
import { syncSeededPersistentStoresFromLocalStorage } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('S22 blocks impossible weigh-ins before they poison proof', async ({ page }) => {
  await goToWeight(page)

  await safeFill(page.getByLabel('Weight (lb)'), '99999')
  await safeClick(page.getByRole('button', { name: /save today's weight/i }))

  await expect(page.getByText(/weight must be between 50-800 lb/i).first()).toBeVisible()
  await expect(page.getByText(/99999 lb/i)).toHaveCount(0)

  const storedWeights = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_weights') ?? '[]'))
  expect(storedWeights).toEqual([])
})

test('S22 shows quarantined legacy weights without using them as trend proof', async ({ page }) => {
  await page.evaluate(() => {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`
    window.localStorage.setItem(
      'mt_settings',
      JSON.stringify({
        calorieTarget: 2000,
        proteinTarget: 150,
        carbTarget: 200,
        fatTarget: 60,
        weightUnit: 'lb',
        goalMode: 'cut',
        coachingEnabled: true,
        checkInWeekday: 1,
        targetWeeklyRatePercent: 0.5,
      }),
    )
    window.localStorage.setItem(
      'mt_weights',
      JSON.stringify([
        {
          id: 'bad-weight',
          date: todayKey,
          weight: 99999,
          unit: 'lb',
          createdAt: `${todayKey}T07:00:00.000Z`,
        },
      ]),
    )
  })
  await syncSeededPersistentStoresFromLocalStorage(page)
  await page.reload()

  await goToWeight(page)

  await expect(page.getByText(/biometric review/i)).toBeVisible()
  await expect(page.getByText(/excluded from proof/i).first()).toBeVisible()
  await expect(page.getByText(/weight must be between 50-800 lb/i).first()).toBeVisible()
})
