import { expect, test } from '@playwright/test'
import { resetApp, safeClick, safeFill } from './helpers/app'
import { seedCoachWave1Scenario } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('Coach paid path answers locally from Cut OS proof without provider-not-configured copy', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await safeClick(page.getByRole('button', { name: /^coach$/i }))

  await expect(page.getByText(/Coach ready/i)).toBeVisible()
  await expect(page.getByText(/provider not configured/i)).toBeHidden()
  await safeFill(page.getByLabel('Ask a question'), 'Why this action?')
  await safeClick(page.getByRole('button', { name: /Ask Coach/i }))

  await expect(page.getByText(/Cut OS proof packet/i).first()).toBeVisible()
  await expect(page.getByText(/I am not changing targets/i).first()).toBeVisible()
  await expect(page.getByTestId('cut-os-validation-card')).toBeVisible()
  await expect(page.getByText(/provider not configured/i)).toBeHidden()
})

test('Coach setup answer replaces provider setup dead-end for cold users', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^coach$/i }))

  await expect(page.getByText(/Coach ready/i)).toBeVisible()
  await expect(page.getByText(/provider not configured/i)).toBeHidden()
  await safeFill(page.getByLabel('Ask a question'), 'What do I do today?')
  await safeClick(page.getByRole('button', { name: /Ask Coach/i }))

  await expect(page.getByText(/cannot issue a harder-cut recommendation/i).first()).toBeVisible()
  await expect(page.getByText(/Import MacroFactor history/i).first()).toBeVisible()
  await expect(page.getByText(/provider not configured/i)).toBeHidden()
})
