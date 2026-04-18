import { expect, test } from '@playwright/test'
import {
  expectCenterHittable,
  getSettingsCalorieTargetInput,
  goToSettings,
  goToWeight,
  resetApp,
} from '../helpers/app'
import { seedCoachWave1Scenario } from '../helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('standard cut actionable apply path persists the coach update on mobile preview', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await goToWeight(page)

  await expect(page.getByText('Weekly check-in').first()).toBeVisible()
  await expect(page.getByText('Decrease calories').first()).toBeVisible()
  await expectCenterHittable(page.getByRole('button', { name: /apply suggestion/i }))
  await expectCenterHittable(page.getByRole('button', { name: /keep current/i }))

  await page.getByRole('button', { name: /apply suggestion/i }).click()
  await expect(page.getByText(/applied/i).first()).toBeVisible()

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('No active PSMF phase scheduled.')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: green')
  await expect(page.getByTestId('garmin-section')).toContainText(
    'Connect Garmin to import sleep, stress, Body Battery, steps, and cardio into recovery scoring.',
  )
  await expect(getSettingsCalorieTargetInput(page)).toHaveValue('2200')
  await expect(page.getByLabel(/Carbs \(g\)/i)).toHaveValue('220')
})

test('personal floor clamp renders the exact note on mobile preview', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_personal_floor_clamp')
  await goToWeight(page)

  await expect(page.getByText('Decrease calories').first()).toBeVisible()
  await expect(page.getByText('Clamped to your coach minimum: 1252 kcal').first()).toBeVisible()
  await expectCenterHittable(page.getByRole('button', { name: /apply suggestion/i }))
})

test('psmf slower-than-target weeks do not offer an automatic calorie decrease', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'psmf_no_further_decrease')
  await goToWeight(page)

  await expect(page.getByText('Keep targets').first()).toBeVisible()
  await expect(
    page.getByText('PSMF mode active: no further automatic calorie decrease applied.').first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)
  await expectCenterHittable(page.getByRole('button', { name: /keep current/i }))

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('PSMF active until')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: green')
  await expect(page.getByTestId('garmin-section')).toContainText('Garmin is connected. Imported wellness data can influence recovery scoring and coaching holds.')
  await expect(page.getByTestId('garmin-section')).toContainText('Last synced:')
})

test('recent fat-loss mode switches force a stabilization hold on mobile preview', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'fat_loss_mode_stabilization_hold')
  await goToWeight(page)

  await expect(page.getByText('Hold for more data').first()).toBeVisible()
  await expect(
    page
      .getByText('Fat-loss mode changed recently. Hold targets during the current stabilization window.')
      .first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('PSMF phase expired on')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: yellow')
  await expect(page.getByTestId('garmin-section')).toContainText('Garmin sync is temporarily rate limited.')
})

test('recent goal mode switches force a stabilization hold on mobile preview', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'goal_mode_stabilization_hold')
  await goToWeight(page)

  await expect(page.getByText('Hold for more data').first()).toBeVisible()
  await expect(
    page
      .getByText('Goal mode changed recently. Hold targets during the current stabilization window.')
      .first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)

  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('PSMF active until')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Diet break active until')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Planned refeed on')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Recovery strain is elevated this week.')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('PSMF phase required')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('PSMF phase expired')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Diet break active')
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Recovery hold')

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('Diet break active until')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: red')
  await expect(page.getByTestId('garmin-section')).toContainText('Garmin needs to be reconnected before new data can sync.')
  await expect(page.getByTestId('garmin-section')).toContainText('Reconnect Garmin')
})
