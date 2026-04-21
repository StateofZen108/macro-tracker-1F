import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  ensureMealExpanded,
  entryRow,
  goToLog,
  goToSettings,
  openMealSheet,
  resetApp,
  safeClick,
  safeFill,
} from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('corrupted food storage is surfaced and blocked from silent overwrite', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    async function deleteDatabase(name: string): Promise<void> {
      await new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })
    }

    window.localStorage.clear()
    window.localStorage.setItem('mt_foods', '{broken')
    window.localStorage.setItem('mt_schema_version', '0')
    await deleteDatabase('macrotracker-storage')
  })
  await page.reload()
  await expect(page.getByText(/recoverable data issues need review/i).first()).toBeVisible()
  await goToLog(page)

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await safeClick(addFoodSheet.getByRole('button', { name: /create custom food/i }))
  await safeFill(addFoodSheet.getByLabel('Food name'), 'Blocked Save')
  await safeFill(addFoodSheet.getByLabel('Serving size'), '1')
  await safeFill(addFoodSheet.getByLabel('Serving unit'), 'serving')
  await safeFill(addFoodSheet.getByLabel('Calories'), '100')
  await safeFill(addFoodSheet.getByLabel('Protein (g)'), '10')
  await safeFill(addFoodSheet.getByLabel('Carbs (g)'), '10')
  await safeFill(addFoodSheet.getByLabel('Fat (g)'), '1')
  await safeClick(addFoodSheet.getByRole('button', { name: /save custom food/i }))
  await expect(page.getByText(/recoverable data issues need review/i).first()).toBeVisible()
  await expect(
    page.evaluate(() => window.localStorage.getItem('mt_foods')),
  ).resolves.toBe('{broken')
})

test('quota failures do not leave a partial meal save behind', async ({ page }) => {
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
      if (key === 'mt_foods') {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      return originalSetItem.call(this, key, value)
    }
  })

  await addFoodToMeal(page, 'Banana')
  await expect(page.getByText(/storage is full/i).first()).toBeVisible()

  const persistedState = await page.evaluate(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = `${today.getMonth() + 1}`.padStart(2, '0')
    const day = `${today.getDate()}`.padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    const entries = JSON.parse(window.localStorage.getItem(`mt_log_${dateKey}`) ?? '[]')
    const foods = JSON.parse(window.localStorage.getItem('mt_foods') ?? '[]')
    const banana = foods.find((food: { id?: string }) => food.id === 'seed-banana')

    return {
      entryCount: Array.isArray(entries) ? entries.length : -1,
      bananaUsage: banana?.usageCount ?? null,
    }
  })

  expect(persistedState.entryCount).toBe(0)
  expect([0, null]).toContain(persistedState.bananaUsage)
})

test('export and replace import restore logged history', async ({ page }) => {
  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /new food/i }))
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })
  await safeFill(createFoodSheet.getByLabel('Food name'), 'Backup Chicken')
  await safeFill(createFoodSheet.getByLabel('Serving size'), '1')
  await safeFill(createFoodSheet.getByLabel('Serving unit'), 'serving')
  await safeFill(createFoodSheet.getByLabel('Calories'), '180')
  await safeFill(createFoodSheet.getByLabel('Protein (g)'), '30')
  await safeFill(createFoodSheet.getByLabel('Carbs (g)'), '0')
  await safeFill(createFoodSheet.getByLabel('Fat (g)'), '4')
  await safeClick(createFoodSheet.getByRole('button', { name: /save food/i }))

  await goToLog(page)
  await addFoodToMeal(page, 'Backup Chicken')

  await goToSettings(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    safeClick(page.getByRole('button', { name: /export backup/i })),
  ])
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()

  await page.evaluate(() => {
    window.localStorage.clear()
  })
  await page.reload()
  await expect(entryRow(page, 'Backup Chicken')).toBeHidden()

  await goToSettings(page)
  await page
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(downloadPath as string)
  await expect(page.getByText(/backup preview/i)).toBeVisible()
  const backupText = await readFile(downloadPath as string, 'utf8')
  expect(backupText).toContain('Backup Chicken')
  await safeClick(page.getByRole('button', { name: /apply import/i }))
  await expect(page.getByText(/replaced .* foods|import complete|backup restored/i).first()).toBeVisible()
  await goToLog(page)
  await ensureMealExpanded(page)
  await expect(entryRow(page, 'Backup Chicken')).toBeVisible()
})
