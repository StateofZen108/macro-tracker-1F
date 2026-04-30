import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  getAddFoodDialog,
  getAddFoodSearchInput,
  openMealSheet,
  resetApp,
  safeClick,
  safeFill,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('unified logger keeps every paid logging method reachable in one add-food session', async ({ page }) => {
  await openMealSheet(page)
  const addFoodDialog = getAddFoodDialog(page)

  await expect(addFoodDialog.getByPlaceholder(/search your (saved foods|library first)/i)).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^scan barcode$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^scan nutrition label$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^create custom food$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /more ways to log/i })).toBeVisible()

  const noHorizontalOverflow = await addFoodDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  expect(noHorizontalOverflow).toBe(true)
})

test('common food logging path stays within the faster-than-MacroFactor budget', async ({ page }) => {
  const startedAt = Date.now()
  await addFoodToMeal(page, 'Banana')
  const elapsedSeconds = (Date.now() - startedAt) / 1000

  await expect(page.locator('[data-entry-id]').filter({ hasText: 'Banana' }).first()).toBeVisible()
  expect(elapsedSeconds).toBeLessThanOrEqual(7)
})

test('barcode miss keeps label OCR and custom fallback one tap away', async ({ page }) => {
  await openMealSheet(page)
  const addFoodDialog = getAddFoodDialog(page)

  await safeClick(addFoodDialog.getByRole('button', { name: /^scan barcode$/i }))
  await expect(addFoodDialog.getByText(/manual barcode entry/i)).toBeVisible()

  await safeClick(addFoodDialog.getByRole('button', { name: /^back to foods$/i }))
  await safeFill(await getAddFoodSearchInput(page), 'definitely-missing-barcode-item')
  await expect(addFoodDialog.getByRole('button', { name: /^scan nutrition label$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^create custom food$/i })).toBeVisible()
})
