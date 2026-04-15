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
  await expect(page.getByText(/rate of loss was slower than target/i)).toBeVisible()
  await expectCenterHittable(page.getByRole('button', { name: /apply suggestion/i }))
  await expectCenterHittable(page.getByRole('button', { name: /keep current/i }))
})

test('weekly check-in can apply an athlete prep recommendation', async ({ page }) => {
  await seedWeeklyCheckInWindow(page)
  await goToWeight(page)

  await expect(page.getByText(/rate of loss was slower than target/i)).toBeVisible()
  await expect(page.getByText(/1900 cal\/day/i)).toBeVisible()
  await page.getByRole('button', { name: /apply suggestion/i }).click()
  await expect(page.getByText(/applied/i).first()).toBeVisible()

  await goToSettings(page)
  await expect(getSettingsCalorieTargetInput(page)).toHaveValue('1900')
  await expect(page.getByLabel(/Carbs \(g\)/i)).toHaveValue('175')
})
