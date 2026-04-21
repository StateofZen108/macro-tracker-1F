import { expect, test } from '@playwright/test'
import { resetApp, safeClick, safeFill } from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('coach tab starts in not-configured mode and can queue a local question', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  await expect(page.getByText(/provider not configured/i)).toBeVisible()

  await safeFill(page.getByLabel('Ask a question'), 'Why did my weight jump today?')
  await safeClick(page.getByRole('button', { name: /queue question/i }))

  await expect(page.getByText(/1 queued/i)).toBeVisible()
  await expect(page.getByText(/why did my weight jump today/i).first()).toBeVisible()
  await expect(page.getByText(/saved this question locally/i).first()).toBeVisible()
})

test('coach provider scaffold can switch into ready mode without a live backend', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  await safeClick(page.getByRole('button', { name: /^gemini$/i }))

  await expect(page.getByText(/coach ready/i)).toBeVisible()
  await expect(page.getByText(/coach surface and local queue in place/i)).toBeVisible()
})
