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
  safeClick,
  safeFill,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('S22 log layout exposes fast logging methods on initial render', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const dailySummary = page.getByTestId('daily-summary-card')
  await expect(dailySummary).toBeVisible()
  await expectFullyInViewport(dailySummary)
  await expect(page.getByTestId('daily-summary-goal')).toContainText(/goal\s*\d+\s*cal/i)
  await expect(page.getByTestId('daily-summary-calories')).toContainText(/\d+\s*cal/i)
  await expect(page.getByTestId('daily-summary-protein-label')).toHaveText('P')
  await expect(page.getByTestId('daily-summary-protein-value')).toContainText(/\d+g/i)
  await expect(page.getByTestId('daily-summary-fat-label')).toHaveText('F')
  await expect(page.getByTestId('daily-summary-fat-value')).toContainText(/\d+g/i)
  await expect(page.getByTestId('daily-summary-carbs-label')).toHaveText('C')
  await expect(page.getByTestId('daily-summary-carbs-value')).toContainText(/\d+g/i)
  await expectFullyInViewport(page.getByTestId('daily-summary-carbs'))
  await expect(page.getByTestId('daily-summary-protein')).toHaveAttribute('data-macro-token', 'protein')
  await expect(page.getByTestId('daily-summary-fat')).toHaveAttribute('data-macro-token', 'fat')
  await expect(page.getByTestId('daily-summary-carbs')).toHaveAttribute('data-macro-token', 'carbs')
  const summaryFitsWithoutHorizontalScroll = await dailySummary.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  )
  expect(summaryFitsWithoutHorizontalScroll).toBe(true)

  const fastLogButtons = [
    page.getByTestId('fast-log-primary-search'),
    page.getByTestId('fast-log-scan'),
    page.getByTestId('fast-log-quick-add'),
    page.getByTestId('fast-log-copy'),
    page.getByTestId('fast-log-custom'),
    page.getByRole('button', { name: /^logging settings$/i }),
  ]

  for (const button of fastLogButtons) {
    await expect(button).toBeVisible()
    await expectFullyInViewport(button)
    await expectCenterHittable(button)
  }

  await expect(page.getByTestId('fast-log-primary-search')).toHaveText(/search food/i)
  await expect(page.getByTestId('meal-ledger-row').first()).toBeVisible()
  await expectFullyInViewport(page.locator('[data-meal-section="breakfast"]').getByRole('button', { name: /add food to breakfast/i }))
  await expect(page.getByTestId('meal-ledger-macro-rail').first()).toBeVisible()

  const navHasNoVisibleTruncatedLabels = await page.locator('nav').last().evaluate((nav) => {
    return [...nav.querySelectorAll('span')]
      .filter((span) => {
        const rect = span.getBoundingClientRect()
        const styles = window.getComputedStyle(span)
        return rect.width > 2 && rect.height > 2 && styles.visibility !== 'hidden' && styles.display !== 'none'
      })
      .every((span) => !span.textContent?.includes('...'))
  })
  expect(navHasNoVisibleTruncatedLabels).toBe(true)
})

test('breakfast add button is hittable and search clears stale selection', async ({ page }) => {
  const breakfastButton = page.getByRole('button', { name: /add food to breakfast/i })
  await expect(breakfastButton).toBeVisible()
  await expectCenterHittable(breakfastButton)
  await breakfastButton.scrollIntoViewIfNeeded()

  await openMealSheet(page)
  const searchInput = await getAddFoodSearchInput(page)

  await safeFill(searchInput, 'Chicken')
  await safeClick(page.getByRole('button', { name: /Chicken Breast/i }).first())
  await expect(page.getByText('Selected food')).toBeVisible()

  await safeFill(searchInput, 'Banana')
  await expect(page.getByText('Selected food')).toBeHidden()
})

test('entry delete offers undo and restores the item', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const bananaRow = entryRow(page, 'Banana')
  await bananaRow.scrollIntoViewIfNeeded()
  await expectCenterHittable(bananaRow)
  await safeClick(bananaRow.getByRole('button', { name: /^banana\b/i }))
  await safeClick(page.getByRole('button', { name: /delete entry/i }))
  await expect(page.getByText('Entry removed')).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^undo$/i }))
  await expect(bananaRow).toBeVisible()
})

test('first logged row stays tappable above the fixed bottom nav', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  const bananaRow = entryRow(page, 'Banana')
  await bananaRow.scrollIntoViewIfNeeded()
  await expectCenterHittable(bananaRow)
})

test('quick add logs a snapshot-only entry and updates totals', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /quick add/i }))
  const quickAddSheet = page.getByRole('dialog', { name: /quick add/i })
  await safeFill(quickAddSheet.getByLabel('Label (optional)'), 'Protein bar')
  await safeFill(quickAddSheet.getByLabel('Calories'), '220')
  await safeFill(quickAddSheet.getByLabel('Protein (g)'), '20')
  await safeFill(quickAddSheet.getByLabel('Carbs (g)'), '23')
  await safeFill(quickAddSheet.getByLabel('Fat (g)'), '7')
  await safeClick(quickAddSheet.getByRole('button', { name: /log quick add/i }))
  await ensureMealExpanded(page)

  const quickAddRow = entryRow(page, 'Protein bar')
  await expect(quickAddRow).toContainText('220 cal')
  await expect(page.getByTestId('daily-summary-calories')).toContainText('220 cal')
  await expect(page.getByTestId('daily-summary-protein-label')).toHaveText('P')
  await expect(page.getByTestId('daily-summary-protein-value')).toHaveText('20g')
  await expect(page.getByTestId('daily-summary-fat-label')).toHaveText('F')
  await expect(page.getByTestId('daily-summary-fat-value')).toHaveText('7g')
  await expect(page.getByTestId('daily-summary-carbs-label')).toHaveText('C')
  await expect(page.getByTestId('daily-summary-carbs-value')).toHaveText('23g')
})

test('rapid duplicate quick-add submit is idempotent', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /quick add/i }))
  const quickAddSheet = page.getByRole('dialog', { name: /quick add/i })
  await safeFill(quickAddSheet.getByLabel('Label (optional)'), 'Protein bar')
  await safeFill(quickAddSheet.getByLabel('Calories'), '220')
  await safeFill(quickAddSheet.getByLabel('Protein (g)'), '20')
  await safeFill(quickAddSheet.getByLabel('Carbs (g)'), '23')
  await safeFill(quickAddSheet.getByLabel('Fat (g)'), '7')

  const submitButton = quickAddSheet.getByRole('button', { name: /log quick add/i })
  await expect(submitButton).toBeVisible()
  await submitButton.evaluate((button) => {
    if (button instanceof HTMLElement) {
      button.click()
      button.click()
      button.click()
    }
  })

  await ensureMealExpanded(page)
  await expect(page.locator('[data-entry-id]').filter({ hasText: 'Protein bar' })).toHaveCount(1)
  await expect(page.getByTestId('daily-summary-calories')).toContainText('220 cal')
})

test('rapid duplicate add-to-meal submit is idempotent', async ({ page }) => {
  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await safeFill(await getAddFoodSearchInput(page), 'Banana')
  await safeClick(addFoodSheet.getByRole('button', { name: /banana/i }).first())

  const addButton = addFoodSheet.getByRole('button', { name: /add to meal/i })
  await expect(addButton).toBeVisible()
  await addButton.evaluate((button) => {
    if (button instanceof HTMLElement) {
      button.click()
      button.click()
      button.click()
    }
  })

  await ensureMealExpanded(page)
  await expect(page.locator('[data-entry-id]').filter({ hasText: 'Banana' })).toHaveCount(1)
  await expect(page.getByTestId('daily-summary-calories')).toContainText('105 cal')
})

test('bottom sheet escape closes clean sheets and dirty discard stays hittable', async ({ page }) => {
  await safeClick(page.getByRole('button', { name: /quick add/i }))
  await expect(page.getByRole('dialog', { name: /quick add/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /quick add/i })).toBeHidden()
  await expectCenterHittable(page.getByRole('button', { name: /^quick add$/i }))

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  const searchInput = await getAddFoodSearchInput(page)
  await safeFill(searchInput, 'Banana')
  await safeClick(addFoodSheet.getByRole('button', { name: /close sheet/i }))

  const discardDialog = page.getByRole('alertdialog', { name: /discard changes/i })
  await expect(discardDialog).toBeVisible()
  await expectCenterHittable(discardDialog.getByRole('button', { name: /keep editing/i }))
  await safeClick(discardDialog.getByRole('button', { name: /keep editing/i }))
  await expect(addFoodSheet).toBeVisible()

  await safeClick(addFoodSheet.getByRole('button', { name: /close sheet/i }))
  await expectCenterHittable(discardDialog.getByRole('button', { name: /^discard$/i }))
  await safeClick(discardDialog.getByRole('button', { name: /^discard$/i }))
  await expect(addFoodSheet).toBeHidden()
})

test('fast add keeps the sheet open and reuses the last amount shortcut', async ({ page }) => {
  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  let searchInput = await getAddFoodSearchInput(page)
  await safeFill(searchInput, 'Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await safeClick(addFoodSheet.getByRole('button', { name: /^Add 1x$/i }).first())
  await expect(addFoodSheet).toBeVisible()
  await expect(searchInput).toHaveValue('Banana')
  await safeClick(addFoodSheet.getByRole('button', { name: /close sheet/i }))
  await expect(page.getByRole('alertdialog', { name: /discard changes/i })).toBeVisible()
  await safeClick(page.getByRole('button', { name: /^discard$/i }))

  await openMealSheet(page)
  searchInput = await getAddFoodSearchInput(page)
  await safeFill(searchInput, 'Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await safeClick(addFoodSheet.getByRole('button', { name: /banana/i }).first())
  await safeFill(addFoodSheet.getByLabel('Servings'), '1.5')
  await safeClick(addFoodSheet.getByRole('button', { name: /add to meal/i }))

  await openMealSheet(page)
  searchInput = await getAddFoodSearchInput(page)
  await safeFill(searchInput, 'Banana')
  await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
  await expect(addFoodSheet.getByRole('button', { name: /use last amount/i }).first()).toBeVisible()
  await safeClick(addFoodSheet.getByRole('button', { name: /use last amount/i }).first())
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
