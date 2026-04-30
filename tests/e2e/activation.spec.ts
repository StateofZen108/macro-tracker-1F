import { expect, test } from '@playwright/test'
import { expectFullyInViewport, resetApp, safeClick } from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('cold user first viewport shows the five activation actions without hunting', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^home$/i }))

  const activationCard = page.getByTestId('cut-os-activation')
  await expect(activationCard).toBeVisible()
  await expect(activationCard.getByTestId('activation-step-import_history')).toBeVisible()
  await expect(activationCard.getByTestId('activation-step-log_first_food')).toBeVisible()
  await expect(activationCard.getByTestId('activation-step-set_cut_target')).toBeVisible()
  await expect(activationCard.getByTestId('activation-step-weigh_in')).toBeVisible()
  await expect(activationCard.getByTestId('activation-step-ask_coach')).toBeVisible()
  await expectFullyInViewport(activationCard.getByRole('button', { name: /Import MacroFactor history/i }))
  await expectFullyInViewport(activationCard.getByRole('button', { name: /Ask Coach/i }))
})

test('activation import CTA still deep-links to MacroFactor import focus', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^home$/i }))
  await safeClick(page.getByTestId('cut-os-activation').getByRole('button', { name: /Import MacroFactor history/i }))

  const macroFactorButton = page.getByTestId('macrofactor-history-import-button')
  await expect(macroFactorButton).toBeVisible()
  await expectFullyInViewport(macroFactorButton)
})
