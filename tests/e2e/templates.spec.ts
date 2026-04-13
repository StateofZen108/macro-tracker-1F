import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  applyBulkPreview,
  ensureMealExpanded,
  entryRow,
  resetApp,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('copy previous day duplicates entries into the current date', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  await page.getByRole('button', { name: /previous day/i }).click()
  await page.getByRole('button', { name: /quick add/i }).click()
  const quickAddSheet = page.getByRole('dialog', { name: /quick add/i })
  await quickAddSheet.getByLabel('Label (optional)').fill('Yesterday add')
  await quickAddSheet.getByLabel('Calories').fill('100')
  await quickAddSheet.getByLabel('Protein (g)').fill('0')
  await quickAddSheet.getByLabel('Carbs (g)').fill('25')
  await quickAddSheet.getByLabel('Fat (g)').fill('0')
  await quickAddSheet.getByRole('button', { name: /log quick add/i }).click()

  await page.getByRole('button', { name: /next day/i }).click()
  await page.getByRole('button', { name: /copy previous/i }).click()
  await page.getByRole('button', { name: /append previous day/i }).click()
  await applyBulkPreview(page, 'append')

  await expect(entryRow(page, 'Yesterday add')).toBeVisible()
})

test('saved meals can be saved, applied, deleted, and restored', async ({ page }) => {
  await addFoodToMeal(page, 'Banana')
  await addFoodToMeal(page, 'Apple')

  await page.getByRole('button', { name: /log$/i }).click()
  await ensureMealExpanded(page)
  await page.getByRole('button', { name: /save as saved meal/i }).click()
  const saveTemplateSheet = page.getByRole('dialog', { name: /save saved meal/i })
  await saveTemplateSheet.getByLabel('Saved meal name').fill('Usual breakfast')
  await saveTemplateSheet.getByRole('button', { name: /save saved meal/i }).click()

  await expect(page.getByRole('button', { name: /^usual breakfast$/i })).toBeVisible()

  await page.getByRole('button', { name: /next day/i }).click()
  await page.getByRole('button', { name: /^usual breakfast$/i }).click()
  await applyBulkPreview(page, 'append')
  await expect(entryRow(page, 'Banana')).toBeVisible()
  await expect(entryRow(page, 'Apple')).toBeVisible()

  await page.getByRole('button', { name: /more saved meals/i }).click()
  const templateSheet = page.getByRole('dialog', { name: /saved meals/i })
  await templateSheet.getByRole('button', { name: /delete usual breakfast saved meal/i }).click()
  await templateSheet.getByRole('button', { name: /delete permanently/i }).click()
  await expect(page.getByText(/saved meal deleted/i)).toBeVisible()
  await templateSheet.getByRole('button', { name: /close sheet/i }).click()
  await page.getByRole('button', { name: /^undo$/i }).last().click()
  await expect(page.getByRole('button', { name: /^usual breakfast$/i })).toBeVisible()
})
