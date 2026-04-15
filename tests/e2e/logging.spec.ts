import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  ensureMealExpanded,
  entryRow,
  expectCenterHittable,
  expectFullyInViewport,
  getAddFoodSearchInput,
  openMealSheet,
  resetApp,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('S22 log layout keeps day status and activity actions hittable on initial render', async ({ page }) => {
  await expectFullyInViewport(page.getByText('Day status').first())
  await expectFullyInViewport(page.getByText('Activity').first())
  await expectCenterHittable(page.getByRole('button', { name: /^complete$/i }))
})

test('breakfast add button is hittable and search clears stale selection', async ({ page }) => {
  const breakfastButton = page.getByRole('button', { name: /add food to breakfast/i })
  await expect(breakfastButton).toBeVisible()
  await expectCenterHittable(breakfastButton)
  await breakfastButton.scrollIntoViewIfNeeded()

  await openMealSheet(page)
  const searchInput = getAddFoodSearchInput(page)

  await searchInput.fill('Chicken')
  await page.getByRole('button', { name: /Chicken Breast/i }).first().click()
  await expect(page.getByText('Selected food')).toBeVisible()

  await searchInput.fill('Banana')
  await expect(page.getByText('Selected food')).toBeHidden()
})

test('entry delete offers undo and restores the item', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const bananaRow = entryRow(page, 'Banana')
  await bananaRow.scrollIntoViewIfNeeded()
  await expectCenterHittable(bananaRow)
  await bananaRow.getByRole('button', { name: /^banana\b/i }).click()
  await page.getByRole('button', { name: /delete entry/i }).click()
  await expect(page.getByText('Entry removed')).toBeVisible()
  await page.getByRole('button', { name: /^undo$/i }).click()
  await expect(bananaRow).toBeVisible()
})

test('first logged row stays tappable above the fixed bottom nav', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const bananaRow = entryRow(page, 'Banana')
  await bananaRow.scrollIntoViewIfNeeded()
  await expectCenterHittable(bananaRow)
})

test('quick add logs a snapshot-only entry and updates totals', async ({ page }) => {
  await page.getByRole('button', { name: /quick add/i }).click()
  const quickAddSheet = page.getByRole('dialog', { name: /quick add/i })
  await quickAddSheet.getByLabel('Label (optional)').fill('Protein bar')
  await quickAddSheet.getByLabel('Calories').fill('220')
  await quickAddSheet.getByLabel('Protein (g)').fill('20')
  await quickAddSheet.getByLabel('Carbs (g)').fill('23')
  await quickAddSheet.getByLabel('Fat (g)').fill('7')
  await quickAddSheet.getByRole('button', { name: /log quick add/i }).click()
  await ensureMealExpanded(page)

  const quickAddRow = entryRow(page, 'Protein bar')
  await expect(quickAddRow).toContainText('220 cal')
  await expect(page.getByText('220 cal').first()).toBeVisible()
})

test('fast add keeps the sheet open and reuses the last amount shortcut', async ({ page }) => {
  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  const searchInput = getAddFoodSearchInput(page)
  await searchInput.fill('Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await addFoodSheet.getByRole('button', { name: /^Add 1x$/i }).first().click()
  await expect(addFoodSheet).toBeVisible()
  await expect(searchInput).toHaveValue('Banana')
  await addFoodSheet.getByRole('button', { name: /close sheet/i }).click()
  await expect(page.getByRole('alertdialog', { name: /discard changes/i })).toBeVisible()
  await page.getByRole('button', { name: /^discard$/i }).click()

  await openMealSheet(page)
  await searchInput.fill('Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await addFoodSheet.getByRole('button', { name: /banana/i }).first().click()
  await addFoodSheet.getByRole('button', { name: /^1.5x$/i }).click()
  await addFoodSheet.getByRole('button', { name: /add to meal/i }).click()

  await openMealSheet(page)
  await searchInput.fill('Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await expect(addFoodSheet.getByRole('button', { name: /use last amount/i }).first()).toBeVisible()
  await addFoodSheet.getByRole('button', { name: /use last amount/i }).first().click()
  await expect(addFoodSheet).toBeVisible()
})

test('offline mode updates the badge and disables barcode scan entry points', async ({ page, context }) => {
  await openMealSheet(page)
  await context.setOffline(true)
  await page.waitForFunction(() => navigator.onLine === false)
  await expect(page.getByText(/offline/i).first()).toBeVisible()

  const scanButton = page.getByRole('button', { name: /scan barcode/i })
  const scanNutritionLabelButton = page.getByRole('button', { name: /scan nutrition label/i })
  await expect(scanButton).toBeDisabled()
  await expect(scanNutritionLabelButton).toBeDisabled()
  await expect(page.getByText(/local foods still work/i)).toBeVisible()
  await context.setOffline(false)
})
