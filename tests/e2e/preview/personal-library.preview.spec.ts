import { expect, test } from '@playwright/test'
import { ensureMealExpanded, entryRow, getAddFoodSearchInput, openMealSheet, resetApp } from '../helpers/app'
import { seedPersonalLibraryScenario } from '../helpers/seed'

const REMOTE_CATALOG_RESPONSE = {
  query: 'greek yogurt',
  providers: ['usda_fdc'],
  remoteStatus: 'ok',
  results: [
    {
      remoteKey: '12345',
      provider: 'usda_fdc',
      name: 'Greek Yogurt',
      brand: 'Test Dairy',
      servingSize: 170,
      servingUnit: 'g',
      calories: 120,
      protein: 16,
      carbs: 6,
      fat: 0,
      barcode: '000111222333',
      importConfidence: 'direct_match',
      sourceQuality: 'high',
    },
  ],
}

async function clickCatalogImportAction(page: import('@playwright/test').Page) {
  const action = page
    .getByRole('button', { name: /^(import and log|review and import|fix and save)$/i })
    .first()

  await expect(action).toBeVisible()
  await action.click()

  if (!(await page.getByText(/already in your archived library/i).isVisible().catch(() => false))) {
    await expect(action).toBeVisible()
    await action.click()
  }
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('repeat this meal surfaces recent foods and reuses the last amount', async ({ page }) => {
  await seedPersonalLibraryScenario(page, 'repeat_this_meal')
  await openMealSheet(page)

  await expect(page.getByText(/repeat this meal/i)).toBeVisible()
  await page.getByRole('button', { name: /use last amount/i }).first().click()

  await ensureMealExpanded(page)
  await expect(entryRow(page, 'Greek Yogurt')).toContainText('180 cal')
  const todaysServings = await page.evaluate(() => {
    const today = new Date()
    const dateKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`
    const entries = JSON.parse(window.localStorage.getItem(`mt_log_${dateKey}`) ?? '[]')
    return entries.find((entry: { foodId?: string }) => entry.foodId === 'food-greek-yogurt')?.servings ?? null
  })

  expect(todaysServings).toBe(1.5)
})

test('remote imports become local foods and immediately resolve as in-library matches', async ({ page }) => {
  await seedPersonalLibraryScenario(page, 'remote_import_reuse')
  await page.route('**/api/food-catalog/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REMOTE_CATALOG_RESPONSE),
    })
  })

  await openMealSheet(page)
  await page.getByRole('checkbox').check()
  await (await getAddFoodSearchInput(page)).fill('greek yogurt')
  await clickCatalogImportAction(page)

  await expect(page.getByText(/in your library/i)).toBeVisible()
  const importedFood = await page.evaluate(() => {
    const foods = JSON.parse(window.localStorage.getItem('mt_foods') ?? '[]')
    return foods.find((food: { source?: string; name?: string }) => food.source === 'api' && food.name === 'Greek Yogurt') ?? null
  })
  expect(importedFood).not.toBeNull()
  expect(importedFood.searchAliases).toContain('greek yogurt')
  expect(importedFood.remoteReferences).toEqual([
    {
      provider: 'usda_fdc',
      remoteKey: '12345',
      barcode: '000111222333',
    },
  ])
})

test('archived remote matches offer restore instead of creating a duplicate', async ({ page }) => {
  await seedPersonalLibraryScenario(page, 'archived_remote_match')
  await page.route('**/api/food-catalog/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REMOTE_CATALOG_RESPONSE),
    })
  })

  await openMealSheet(page)
  await page.getByRole('checkbox').check()
  await (await getAddFoodSearchInput(page)).fill('greek yogurt')
  await page.getByRole('button', { name: /^import and log$/i }).click()

  await expect(page.getByText(/already in your archived library/i)).toBeVisible()
  await page.getByRole('button', { name: /restore existing food/i }).click()
  await expect(page.getByText(/in your library/i)).toBeVisible()

  const restoredFood = await page.evaluate(() => {
    const foods = JSON.parse(window.localStorage.getItem('mt_foods') ?? '[]')
    return foods.find((food: { name?: string; source?: string }) => food.name === 'Greek Yogurt' && food.source === 'api') ?? null
  })
  expect(restoredFood).not.toBeNull()
  expect(restoredFood.archivedAt).toBeUndefined()
})
