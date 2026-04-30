import { expect, test } from '@playwright/test'
import { goToHome, goToLog, goToWeight, resetApp, safeClick } from './helpers/app'
import { seedCoachWave1Scenario } from './helpers/seed'

function readCutOsModel(element: Element) {
  return {
    diagnosisId: element.getAttribute('data-cut-os-diagnosis-id'),
    primaryAction: element.getAttribute('data-cut-os-primary-action'),
    proofIds: element.getAttribute('data-cut-os-proof-ids'),
    actionStatus: element.getAttribute('data-cut-os-action-status'),
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await resetApp(page)
})

test('Dashboard, Log, Weight, and Coach expose the same mistake-proof command packet', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')

  await goToHome(page)
  const dashboardCard = page.getByTestId('cut-os-command')
  await expect(dashboardCard).toBeVisible()
  const dashboardModel = await dashboardCard.evaluate(readCutOsModel)

  await goToLog(page)
  const logCard = page.getByTestId('cut-os-log-cta')
  await expect(logCard).toBeVisible()
  const logModel = await logCard.evaluate(readCutOsModel)

  await goToWeight(page)
  const weightCard = page.getByTestId('cut-os-weight')
  await expect(weightCard).toBeVisible()
  const weightModel = await weightCard.evaluate(readCutOsModel)

  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  const coachCard = page.getByTestId('cut-os-coach-packet')
  await expect(coachCard).toBeVisible()
  const coachModel = await coachCard.evaluate(readCutOsModel)

  expect(logModel).toEqual(dashboardModel)
  expect(weightModel).toEqual(dashboardModel)
  expect(coachModel).toEqual(dashboardModel)
})
