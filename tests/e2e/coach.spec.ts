import { expect, test } from '@playwright/test'
import { resetApp, safeClick, safeFill } from './helpers/app'
import { seedCoachWave1Scenario } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('coach tab starts in not-configured mode and answers setup questions from local Cut OS proof', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  await expect(page.getByText(/provider not configured/i)).toBeVisible()

  await safeFill(page.getByLabel('Ask a question'), 'Why did my weight jump today?')
  await safeClick(page.getByRole('button', { name: /queue question/i }))

  await expect(page.getByText(/why did my weight jump today/i).first()).toBeVisible()
  await expect(page.getByText(/cannot issue a harder-cut recommendation/i).first()).toBeVisible()
  await expect(page.getByText(/saved this question locally/i).first()).toBeHidden()
})

test('coach answers from the current Cut OS proof packet without a live provider', async ({ page }) => {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')
  await safeClick(page.getByRole('button', { name: /^coach$/i }))

  await safeFill(page.getByLabel('Ask a question'), 'Why this action?')
  await safeClick(page.getByRole('button', { name: /queue question/i }))

  await expect(page.getByText(/Cut OS proof packet/i).first()).toBeVisible()
  await expect(page.getByText(/I am not changing targets/i).first()).toBeVisible()
  await expect(page.getByText(/provider not configured/i).first()).toBeVisible()
  await expect(page.getByText(/saved this question locally/i).first()).toBeHidden()
})

test('coach provider scaffold can switch into ready mode without a live backend', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  await safeClick(page.getByRole('button', { name: /^gemini$/i }))

  await expect(page.getByText(/coach ready/i)).toBeVisible()
  await expect(page.getByText(/coach surface and local queue in place/i)).toBeVisible()
})
