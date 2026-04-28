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

test('standard cut actionable apply path persists the step lever on mobile preview', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await goToWeight(page)

  await expect(page.getByText('Weekly check-in').first()).toBeVisible()
  await expect(page.getByText('Raise steps before lowering calories').first()).toBeVisible()
  const stepTargetButton = page.getByRole('button', { name: /raise daily step target/i })
  await stepTargetButton.scrollIntoViewIfNeeded()
  await expectCenterHittable(stepTargetButton)

  await stepTargetButton.click()
  await expect(page.getByText(/applied/i).first()).toBeVisible()

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('No active PSMF phase scheduled.')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: green')
  await expect(page.getByTestId('garmin-section')).toContainText(
    'Connect Garmin once. After that, MacroTracker keeps sleep, stress, Body Battery, steps, and cardio snapshots updated automatically in the background.',
  )
  await expect(page.getByLabel(/Daily step target/i)).toHaveValue('9500')
  await expect(getSettingsCalorieTargetInput(page)).toHaveValue('2400')
})

test('personal floor clamp evidence stays secondary while step lever is primary', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_personal_floor_clamp')
  await goToWeight(page)

  await expect(page.getByText('Raise steps before lowering calories').first()).toBeVisible()
  await expect(page.getByText('Suggested target: 1252 kcal/day').first()).toBeVisible()
  const stepTargetButton = page.getByRole('button', { name: /raise daily step target/i })
  await stepTargetButton.scrollIntoViewIfNeeded()
  await expectCenterHittable(stepTargetButton)
})

test('psmf slower-than-target weeks do not offer an automatic calorie decrease first', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'psmf_no_further_decrease')
  await goToWeight(page)

  await expect(page.getByText('Raise steps before lowering calories').first()).toBeVisible()
  await expect(page.getByText('Target delta').first()).toBeVisible()
  await expect(page.getByText('No calorie change').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)
  const stepTargetButton = page.getByRole('button', { name: /raise daily step target/i })
  await stepTargetButton.scrollIntoViewIfNeeded()
  await expectCenterHittable(stepTargetButton)

  await goToSettings(page)
  await expect(page.getByTestId('psmf-diet-phase-section')).toContainText('PSMF active until')
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: green')
  await expect(page.getByTestId('garmin-section')).toContainText(
    'Garmin is connected and background automation is active.',
  )
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
  await expect(page.getByTestId('garmin-section')).toContainText(
    'Garmin background sync is temporarily rate limited.',
  )
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
  await expect(page.getByTestId('garmin-section')).toContainText(
    'Garmin needs to be reconnected before automatic background sync can resume.',
  )
  await expect(page.getByTestId('garmin-section')).toContainText('Reconnect Garmin')
})
