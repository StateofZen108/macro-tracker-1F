import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addFoodToMeal, entryRow, goToLog, goToSettings, openMealSheet, resetApp } from './helpers/app'

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

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await addFoodSheet.getByRole('button', { name: /create custom food/i }).click()
  await addFoodSheet.getByLabel('Food name').fill('Blocked Save')
  await addFoodSheet.getByLabel('Serving size').fill('1')
  await addFoodSheet.getByLabel('Serving unit').fill('serving')
  await addFoodSheet.getByLabel('Calories').fill('100')
  await addFoodSheet.getByLabel('Protein (g)').fill('10')
  await addFoodSheet.getByLabel('Carbs (g)').fill('10')
  await addFoodSheet.getByLabel('Fat (g)').fill('1')
  await addFoodSheet.getByRole('button', { name: /save custom food/i }).click()
  await expect(page.getByText(/stored data for this section is unreadable/i).first()).toBeVisible()
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
  await page.getByRole('button', { name: /new food/i }).click()
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })
  await createFoodSheet.getByLabel('Food name').fill('Backup Chicken')
  await createFoodSheet.getByLabel('Serving size').fill('1')
  await createFoodSheet.getByLabel('Serving unit').fill('serving')
  await createFoodSheet.getByLabel('Calories').fill('180')
  await createFoodSheet.getByLabel('Protein (g)').fill('30')
  await createFoodSheet.getByLabel('Carbs (g)').fill('0')
  await createFoodSheet.getByLabel('Fat (g)').fill('4')
  await createFoodSheet.getByRole('button', { name: /save food/i }).click()

  await goToLog(page)
  await addFoodToMeal(page, 'Backup Chicken')

  await goToSettings(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export backup/i }).click(),
  ])
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()

  await page.evaluate(() => {
    window.localStorage.clear()
  })
  await page.reload()
  await expect(entryRow(page, 'Backup Chicken')).toBeHidden()

  await goToSettings(page)
  await page.locator('input[type="file"]').setInputFiles(downloadPath as string)
  await expect(page.getByText(/backup preview/i)).toBeVisible()
  const backupText = await readFile(downloadPath as string, 'utf8')
  const applyImportResult = await page.evaluate(async ({ rawBackupText }) => {
    const importExport = await import('/src/utils/storage/importExport.ts')
    const validation = importExport.validateBackupText(rawBackupText)
    if (!validation.ok) {
      return { ok: false, message: validation.error.message }
    }

    const result = importExport.applyBackupImport(validation.data.backup, 'replace')
    if (!result.ok) {
      return { ok: false, message: result.error.message }
    }

    const today = new Date()
    const year = today.getFullYear()
    const month = `${today.getMonth() + 1}`.padStart(2, '0')
    const day = `${today.getDate()}`.padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    const entries = JSON.parse(window.localStorage.getItem(`mt_log_${dateKey}`) ?? '[]')
    const foods = JSON.parse(window.localStorage.getItem('mt_foods') ?? '[]')

    return {
      ok: true,
      entryNames: Array.isArray(entries)
        ? entries.map((entry: { snapshot?: { name?: string } }) => entry.snapshot?.name ?? '')
        : [],
      foodNames: Array.isArray(foods)
        ? foods.map((food: { name?: string }) => food.name ?? '')
        : [],
    }
  }, { rawBackupText: backupText })
  expect(applyImportResult.ok).toBe(true)
  expect(applyImportResult.entryNames).toContain('Backup Chicken')
  expect(applyImportResult.foodNames).toContain('Backup Chicken')
})
