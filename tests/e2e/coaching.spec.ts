import { expect, test } from '@playwright/test'
import { addFoodToMeal, ensureMealExpanded, entryRow, resetApp } from './helpers/app'
import { seedCoachingWindow } from './helpers/seed'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('coaching stays gated on sparse data', async ({ page }) => {
  await seedCoachingWindow(page, {
    loggedDays: 10,
    weighInDays: 4,
  })

  await expect(
    page.getByText(/hold current targets until the data window is strong enough to act on/i).first(),
  ).toBeVisible()
  await expect(page.getByText(/confidence score/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeHidden()
})

test('coaching shows a recommendation only with consistent data', async ({ page }) => {
  await seedCoachingWindow(page, {
    loggedDays: 21,
    weighInDays: 14,
    markCompleteDays: true,
  })

  await expect(page.getByText('21/21').first()).toBeVisible()
  await expect(page.getByText(/all-days target/i)).toBeVisible()
  await expect(page.getByText(/confidence score/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeVisible()
  await page.getByRole('button', { name: /keep current/i }).click()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toBeHidden()
})

test('fasting day requires explicit confirmation before clearing intake', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const fastingButton = page.getByRole('button', { name: /^fasting$/i })
  await fastingButton.scrollIntoViewIfNeeded()
  await fastingButton.click({ force: true })

  await expect(page.getByRole('heading', { name: /clear intake and mark fasting/i })).toBeVisible()
  await page.getByRole('button', { name: /^clear intake and mark fasting$/i }).click()

  await expect(entryRow(page, 'Banana')).toBeHidden()
  await expect(page.getByText(/fasting day saved/i)).toBeVisible()
  await page.getByRole('button', { name: /^undo$/i }).click()
  await ensureMealExpanded(page)
  await expect(entryRow(page, 'Banana')).toBeVisible()
})

test('interventions can be logged and edited from the log screen', async ({ page }) => {
  const logInterventionButton = page.getByRole('button', { name: /log your first intervention/i })
  await logInterventionButton.scrollIntoViewIfNeeded()
  await logInterventionButton.click({ force: true })
  const interventionSheet = page.getByRole('dialog', { name: /log intervention/i })
  await interventionSheet.getByLabel('Name').fill('Caffeine')
  await interventionSheet.getByRole('button', { name: /^stimulant$/i }).click()
  await interventionSheet.getByLabel('Dose').fill('200')
  await interventionSheet.getByLabel('Unit').fill('mg')
  await interventionSheet.getByLabel('Time taken').fill('08:00')
  await interventionSheet.getByRole('button', { name: /log intervention/i }).click()

  await expect(page.getByText(/caffeine/i).first()).toBeVisible()
  await page.getByRole('button', { name: /200 mg/i }).first().click()
  const editInterventionSheet = page.getByRole('dialog', { name: /edit intervention/i })
  await editInterventionSheet.getByLabel('Dose').fill('250')
  await editInterventionSheet.getByRole('button', { name: /save intervention/i }).click()

  await expect(page.getByText(/250 mg/i).first()).toBeVisible()
})

test('activity can be logged and cleared from the log screen', async ({ page }) => {
  await page.getByLabel('Steps').fill('9000')
  await page.getByLabel('Cardio minutes').fill('35')
  await page.getByLabel('Cardio type').selectOption('walk')
  await page.getByLabel('Note').fill('Post-workout walk')
  await page.getByRole('button', { name: /save activity/i }).click()

  await expect(page.getByText(/logged for this day/i)).toBeVisible()
  await expect(page.getByLabel('Steps')).toHaveValue('9000')
  await expect(page.getByLabel('Cardio minutes')).toHaveValue('35')

  await page.getByRole('button', { name: /clear activity/i }).click()
  await expect(page.getByText(/not logged yet/i)).toBeVisible()
  await page.getByRole('button', { name: /^undo$/i }).click()
  await expect(page.getByLabel('Steps')).toHaveValue('9000')
})
