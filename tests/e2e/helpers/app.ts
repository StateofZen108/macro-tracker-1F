import { expect, type Locator, type Page } from '@playwright/test'

async function resetApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('domcontentloaded')
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
    window.sessionStorage.clear()
    await deleteDatabase('macrotracker-app')
    await deleteDatabase('macrotracker-storage')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: /^log$/i })).toBeVisible()
}

async function expectCenterHittable(locator: Locator) {
  await expect
    .poll(async () =>
      locator.evaluate((element: HTMLElement) => {
        const rect = element.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const topElement = document.elementFromPoint(centerX, centerY)

        return topElement === element || element.contains(topElement)
      }),
    )
    .toBeTruthy()
}

async function expectFullyInViewport(locator: Locator) {
  await expect
    .poll(async () =>
      locator.evaluate((element: HTMLElement) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth
        )
      }),
    )
    .toBeTruthy()
}

async function openMealSheet(
  page: Page,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  const existingDialog = page.getByRole('dialog', { name: /add food/i })
  if (await existingDialog.isVisible().catch(() => false)) {
    await expect(existingDialog).toBeVisible()
    return
  }

  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })

  const mealSection = page.locator(`[data-meal-section="${meal}"]`)
  const addFoodButton = mealSection.getByRole('button', { name: /^add food$/i }).first()
  if (!(await addFoodButton.isVisible().catch(() => false))) {
    const quickAddButton = mealSection.getByRole('button', {
      name: new RegExp(`^add food to ${meal}$`, 'i'),
    })
    await quickAddButton.scrollIntoViewIfNeeded()
    await quickAddButton.click({ force: true })
    const addFoodDialog = page.getByRole('dialog', { name: /add food/i })
    if (!(await addFoodDialog.isVisible().catch(() => false))) {
      const fallbackAddFoodButton = mealSection.getByRole('button', { name: /^add food$/i }).first()
      if (await fallbackAddFoodButton.isVisible().catch(() => false)) {
        await fallbackAddFoodButton.click({ force: true })
      }
    }
    await expect(addFoodDialog).toBeVisible()
    return
  }

  await addFoodButton.scrollIntoViewIfNeeded()
  await addFoodButton.click({ force: true })
  await expect(page.getByRole('dialog', { name: /add food/i })).toBeVisible()
}

async function ensureMealExpanded(
  page: Page,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  const mealSection = page.locator(`[data-meal-section="${meal}"]`)
  const inlineAddFoodButton = mealSection.getByRole('button', { name: /^add food$/i }).first()

  if (await inlineAddFoodButton.isVisible().catch(() => false)) {
    return
  }

  const mealToggleButton = mealSection.getByRole('button', {
    name: new RegExp(`^${meal}\\b`, 'i'),
  }).first()
  await mealToggleButton.scrollIntoViewIfNeeded()
  await mealToggleButton.click()
  await expect(inlineAddFoodButton).toBeVisible()
}

async function applyBulkPreview(page: Page, mode?: 'append' | 'replace target') {
  const previewSheet = page.getByRole('dialog', { name: /review/i })
  await expect(previewSheet).toBeVisible()

  if (mode === 'append') {
    await previewSheet.getByRole('button', { name: /^append$/i }).click()
  }

  if (mode === 'replace target') {
    await previewSheet.getByRole('button', { name: /^replace target$/i }).click()
  }

  await previewSheet.getByRole('button', { name: /apply changes/i }).click()
}

async function addFoodToMeal(
  page: Page,
  query: string,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  await openMealSheet(page, meal)
  await page.getByPlaceholder('Search your saved foods').fill(query)
  await page.getByRole('button', { name: new RegExp(query, 'i') }).first().click()
  await page.getByRole('button', { name: /add to meal/i }).click()

  const addFoodDialog = page.getByRole('dialog', { name: /add food/i })
  if (await addFoodDialog.isVisible().catch(() => false)) {
    return
  }

  await ensureMealExpanded(page, meal)
}

async function clickNavButton(page: Page, name: RegExp) {
  const button = page.getByRole('button', { name }).first()
  await expect(button).toBeVisible()
  await button.scrollIntoViewIfNeeded()
  await button.evaluate((element: HTMLElement) => element.click())
}

async function goToSettings(page: Page) {
  await clickNavButton(page, /^settings$/i)
}

async function goToWeight(page: Page) {
  await clickNavButton(page, /^weight$/i)
}

async function goToLog(page: Page) {
  await clickNavButton(page, /^log$/i)
}

function entryRow(page: Page, name: string) {
  return page.locator('[data-entry-id]').filter({ hasText: name }).first()
}

export {
  addFoodToMeal,
  applyBulkPreview,
  ensureMealExpanded,
  entryRow,
  expectCenterHittable,
  expectFullyInViewport,
  goToLog,
  goToSettings,
  goToWeight,
  openMealSheet,
  resetApp,
}
