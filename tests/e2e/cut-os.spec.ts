import { expect, test } from '@playwright/test'
import { expectFullyInViewport, goToHome, goToLog, goToWeight, resetApp, safeClick } from './helpers/app'
import { seedCoachWave1Scenario } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await resetApp(page)
})

test('Cut OS command is visible in the first dashboard viewport', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await goToHome(page)

  const commandCard = page.getByTestId('cut-os-command')
  await expect(commandCard).toBeVisible()
  await expect(commandCard.getByText(/Cut OS/i).first()).toBeVisible()
  await expect(commandCard.getByRole('button').first()).toBeVisible()
  await expectFullyInViewport(commandCard.getByRole('button').first())
})

test('cold user sees Cut OS activation and can try a sealed demo without writing real logs', async ({ page }) => {
  await goToHome(page)

  const activationCard = page.getByTestId('cut-os-activation')
  await expect(activationCard).toBeVisible()
  await expect(activationCard).toHaveAttribute('data-cut-os-activation-state', 'needs_proof')
  await expect(activationCard.getByText(/Build your Cut OS in 10 minutes/i)).toBeVisible()
  await expectFullyInViewport(activationCard.getByRole('button', { name: /Import MacroFactor history/i }))

  await safeClick(activationCard.getByRole('button', { name: /Try demo cut/i }))

  await expect(activationCard).toHaveAttribute('data-cut-os-activation-state', 'demo_active')
  await expect(activationCard.getByText(/Demo Cut OS is sealed/i)).toBeVisible()
  const commandCard = page.getByTestId('cut-os-command')
  await expect(commandCard).toBeVisible()
  await expect(commandCard).toHaveAttribute('data-cut-os-primary-action', 'Raise steps before cutting calories')

  const realStoreCounts = await page.evaluate(() => {
    const weightRows = JSON.parse(window.localStorage.getItem('mt_weights') ?? '[]') as unknown[]
    return {
      logKeys: Object.keys(window.localStorage).filter((key) => key.startsWith('mt_log_')).length,
      weights: Array.isArray(weightRows) ? weightRows.length : 0,
    }
  })
  expect(realStoreCounts).toEqual({ logKeys: 0, weights: 0 })

  await safeClick(activationCard.getByRole('button', { name: /Exit demo/i }))
  await expect(activationCard).toHaveAttribute('data-cut-os-activation-state', 'needs_proof')
  await expect(commandCard).toBeHidden()
})

test('activation import CTA deep-links to focused MacroFactor import', async ({ page }) => {
  await goToHome(page)

  const activationCard = page.getByTestId('cut-os-activation')
  await expect(activationCard).toBeVisible()

  const fileChooserAttempt = page.waitForEvent('filechooser', { timeout: 1500 }).catch(() => null)
  await safeClick(activationCard.getByRole('button', { name: /Import MacroFactor history/i }))

  const macrofactorCard = page.getByTestId('macrofactor-history-import-card')
  await expect(macrofactorCard).toBeVisible()
  const macrofactorButton = page.getByTestId('macrofactor-history-import-button')
  await expect(macrofactorButton).toBeFocused()
  await expectFullyInViewport(macrofactorButton)
  await fileChooserAttempt
})

test('activation import focus falls back to a visible button when picker auto-open is blocked', async ({ page }) => {
  await page.evaluate(() => {
    const originalClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function patchedInputClick() {
      if (this.getAttribute('data-testid') === 'macrofactor-history-input') {
        throw new Error('Synthetic file picker block')
      }

      return originalClick.call(this)
    }
  })
  await goToHome(page)

  const activationCard = page.getByTestId('cut-os-activation')
  await safeClick(activationCard.getByRole('button', { name: /Import MacroFactor history/i }))

  const macrofactorButton = page.getByTestId('macrofactor-history-import-button')
  await expect(macrofactorButton).toBeVisible()
  await expect(macrofactorButton).toBeFocused()
  await expectFullyInViewport(macrofactorButton)
})

test('Cut OS command stays aligned across Dashboard, Log, Weight, and Coach', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await goToHome(page)

  const dashboardCard = page.getByTestId('cut-os-command')
  await expect(dashboardCard).toBeVisible()
  const dashboardModel = await dashboardCard.evaluate((element) => ({
    diagnosisId: element.getAttribute('data-cut-os-diagnosis-id'),
    primaryAction: element.getAttribute('data-cut-os-primary-action'),
    proofIds: element.getAttribute('data-cut-os-proof-ids'),
    actionStatus: element.getAttribute('data-cut-os-action-status'),
  }))

  await goToLog(page)
  const logCard = page.getByTestId('cut-os-log-cta')
  await expect(logCard).toBeVisible()
  const logModel = await logCard.evaluate((element) => ({
    diagnosisId: element.getAttribute('data-cut-os-diagnosis-id'),
    primaryAction: element.getAttribute('data-cut-os-primary-action'),
    proofIds: element.getAttribute('data-cut-os-proof-ids'),
    actionStatus: element.getAttribute('data-cut-os-action-status'),
  }))

  await goToWeight(page)
  const weightCard = page.getByTestId('cut-os-weight')
  await expect(weightCard).toBeVisible()
  const weightModel = await weightCard.evaluate((element) => ({
    diagnosisId: element.getAttribute('data-cut-os-diagnosis-id'),
    primaryAction: element.getAttribute('data-cut-os-primary-action'),
    proofIds: element.getAttribute('data-cut-os-proof-ids'),
    actionStatus: element.getAttribute('data-cut-os-action-status'),
  }))

  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  const coachCard = page.getByTestId('cut-os-coach-packet')
  await expect(coachCard).toBeVisible()
  const coachModel = await coachCard.evaluate((element) => ({
    diagnosisId: element.getAttribute('data-cut-os-diagnosis-id'),
    primaryAction: element.getAttribute('data-cut-os-primary-action'),
    proofIds: element.getAttribute('data-cut-os-proof-ids'),
    actionStatus: element.getAttribute('data-cut-os-action-status'),
  }))

  for (const model of [logModel, weightModel, coachModel]) {
    expect(model).toEqual(dashboardModel)
  }
})
