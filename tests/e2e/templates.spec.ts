import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  applyBulkPreview,
  ensureMealExpanded,
  entryRow,
  resetApp,
  safeClick,
  safeFill,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('copy previous day duplicates entries into the current date', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  await safeClick(page.getByRole('button', { name: /previous day/i }))
  await safeClick(page.getByRole('button', { name: /quick add/i }))
  const quickAddSheet = page.getByRole('dialog', { name: /quick add/i })
  await safeFill(quickAddSheet.getByLabel('Label (optional)'), 'Yesterday add')
  await safeFill(quickAddSheet.getByLabel('Calories'), '100')
  await safeFill(quickAddSheet.getByLabel('Protein (g)'), '0')
  await safeFill(quickAddSheet.getByLabel('Carbs (g)'), '25')
  await safeFill(quickAddSheet.getByLabel('Fat (g)'), '0')
  await safeClick(quickAddSheet.getByRole('button', { name: /log quick add/i }))

  await safeClick(page.getByRole('button', { name: /next day/i }))
  await safeClick(page.getByRole('button', { name: /copy previous/i }))
  await safeClick(page.getByRole('button', { name: /append previous day/i }))
  await applyBulkPreview(page, 'append')

  await expect(entryRow(page, 'Yesterday add')).toBeVisible()
})

test('saved meals can be saved, applied, deleted, and restored', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  await addFoodToMeal(page, 'Apple')

  await safeClick(page.getByRole('button', { name: /log$/i }))
  await ensureMealExpanded(page)
  await safeClick(page.getByRole('button', { name: /save as saved meal/i }))
  const saveTemplateSheet = page.getByRole('dialog', { name: /save saved meal/i })
  await safeFill(saveTemplateSheet.getByLabel('Saved meal name'), 'Usual breakfast')
  await safeClick(saveTemplateSheet.getByRole('button', { name: /save saved meal/i }))

  await expect(page.getByRole('button', { name: /^usual breakfast$/i })).toBeVisible()

  await safeClick(page.getByRole('button', { name: /next day/i }))
  await safeClick(page.getByRole('button', { name: /^usual breakfast$/i }))
  await applyBulkPreview(page, 'append')
  await expect(entryRow(page, 'Banana')).toBeVisible()
  await expect(entryRow(page, 'Apple')).toBeVisible()

  await safeClick(page.getByRole('button', { name: /more saved meals/i }))
  const templateSheet = page.getByRole('dialog', { name: /saved meals/i })
  await safeClick(templateSheet.getByRole('button', { name: /delete usual breakfast saved meal/i }))
  await safeClick(templateSheet.getByRole('button', { name: /delete permanently/i }))
  await expect(page.getByText(/saved meal deleted/i)).toBeVisible()
  await safeClick(templateSheet.getByRole('button', { name: /close sheet/i }))
  await safeClick(page.getByRole('button', { name: /^undo$/i }).last())
  await expect(page.getByRole('button', { name: /^usual breakfast$/i })).toBeVisible()
})
