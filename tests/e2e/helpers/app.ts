import { expect, type Locator, type Page } from '@playwright/test'

async function clearOriginData(page: Page, storageTypes: string, originOverride?: string) {
  const currentUrl = page.url()
  const origin = originOverride ?? (currentUrl === 'about:blank' ? undefined : new URL(currentUrl).origin)
  if (!origin) {
    return
  }

  const cdpSession = await page.context().newCDPSession(page).catch(() => null)
  if (!cdpSession) {
    return
  }

  try {
    await cdpSession.send('Storage.clearDataForOrigin', { origin, storageTypes })
  } finally {
    await cdpSession.detach().catch(() => undefined)
  }
}

async function expectAppShellReady(page: Page) {
  const timeout = 10000
  const appNav = page.locator('nav').last()

  await expect(appNav.getByRole('button', { name: /^log$/i }).first()).toBeVisible({ timeout })
  await expect(appNav.getByRole('button', { name: /^weight$/i }).first()).toBeVisible({ timeout })
  await expect(appNav.getByRole('button', { name: /^coach$/i }).first()).toBeVisible({ timeout })

  const homeButton = appNav.getByRole('button', { name: /^home$/i }).first()
  if ((await homeButton.count()) > 0) {
    await expect(homeButton).toBeVisible({ timeout })
  }
}

async function resetApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const appOrigin = new URL(page.url()).origin
  await page.goto('about:blank')
  await clearOriginData(page, 'all', appOrigin)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.sessionStorage.clear()
  })
  await expectAppShellReady(page)
  await goToLog(page)
  await expect(page.locator('[data-meal-section="breakfast"]').first()).toBeVisible({ timeout: 10000 })
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

async function safeClick(locator: Locator) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.click()
    }
  })
}

async function safeFill(locator: Locator, value: string) {
  await expect(locator).toBeVisible()
  await locator.evaluate(
    (element, nextValue) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const descriptor = Object.getOwnPropertyDescriptor(
          element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
          'value',
        )
        descriptor?.set?.call(element, nextValue)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
    },
    value,
  )
}

async function safeSelectOption(locator: Locator, value: string) {
  await expect(locator).toBeVisible()
  await locator.evaluate(
    (element, nextValue) => {
      if (element instanceof HTMLSelectElement) {
        element.value = nextValue
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
    },
    value,
  )
}

function getAddFoodDialog(page: Page) {
  return page.getByRole('dialog', { name: /add food/i })
}

async function getAddFoodSearchInput(page: Page): Promise<Locator> {
  const addFoodDialog = getAddFoodDialog(page)
  const searchInput = addFoodDialog.getByPlaceholder(/Search your (saved foods|library first)/i)
  if (await searchInput.isVisible().catch(() => false)) {
    return searchInput
  }

  const expandButton = addFoodDialog.getByRole('button', { name: /more ways to log/i })
  if (await expandButton.isVisible().catch(() => false)) {
    await safeClick(expandButton)
  }

  await expect(searchInput).toBeVisible()
  return searchInput
}

function getSettingsTargetsForm(page: Page) {
  return page.getByTestId('settings-targets-form')
}

function getSettingsCalorieTargetInput(page: Page) {
  return getSettingsTargetsForm(page).getByRole('textbox', { name: /^Calories$/i })
}

function getSelectedFoodCard(page: Page) {
  return page.getByTestId('selected-food-card')
}

function getSelectedFoodServingMeta(page: Page) {
  return page.getByTestId('selected-food-serving-meta')
}

async function openMealSheet(
  page: Page,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  const existingDialog = getAddFoodDialog(page)
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
    await safeClick(quickAddButton)
    const addFoodDialog = getAddFoodDialog(page)
    if (!(await addFoodDialog.isVisible().catch(() => false))) {
      const fallbackAddFoodButton = mealSection.getByRole('button', { name: /^add food$/i }).first()
      if (await fallbackAddFoodButton.isVisible().catch(() => false)) {
        await safeClick(fallbackAddFoodButton)
      }
    }
    await expect(addFoodDialog).toBeVisible()
    return
  }

  await safeClick(addFoodButton)
  await expect(getAddFoodDialog(page)).toBeVisible()
}

async function ensureMealExpanded(
  page: Page,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  const addFoodDialog = getAddFoodDialog(page)
  if (await addFoodDialog.isVisible().catch(() => false)) {
    const closeButton = addFoodDialog.getByRole('button', { name: /^close sheet$/i })
    if (await closeButton.isVisible().catch(() => false)) {
      await safeClick(closeButton)
    }

    const discardDialog = page.getByRole('alertdialog', { name: /discard changes\?/i })
    if (await discardDialog.isVisible().catch(() => false)) {
      await safeClick(discardDialog.getByRole('button', { name: /^discard$/i }))
    }

    await expect(addFoodDialog).toBeHidden({ timeout: 5000 })
  }

  const mealSection = page.locator(`[data-meal-section="${meal}"]`)
  const inlineAddFoodButton = mealSection.getByRole('button', { name: /^add food$/i }).first()

  if (await inlineAddFoodButton.isVisible().catch(() => false)) {
    return
  }

  const mealToggleButton = mealSection.getByRole('button', {
    name: new RegExp(`^${meal}\\b`, 'i'),
  }).first()
  await safeClick(mealToggleButton)
  await expect(inlineAddFoodButton).toBeVisible()
}

async function applyBulkPreview(page: Page, mode?: 'append' | 'replace target') {
  const previewSheet = page.getByRole('dialog', { name: /review/i })
  await expect(previewSheet).toBeVisible()

  if (mode === 'append') {
    await safeClick(previewSheet.getByRole('button', { name: /^append$/i }))
  }

  if (mode === 'replace target') {
    await safeClick(previewSheet.getByRole('button', { name: /^replace target$/i }))
  }

  await safeClick(previewSheet.getByRole('button', { name: /apply changes/i }))
}

async function addFoodToMeal(
  page: Page,
  query: string,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'breakfast',
) {
  await openMealSheet(page, meal)
  const addFoodDialog = getAddFoodDialog(page)
  await safeFill(await getAddFoodSearchInput(page), query)
  await safeClick(page.getByRole('button', { name: new RegExp(query, 'i') }).first())
  await safeClick(page.getByRole('button', { name: /add to meal/i }))

  const dialogClosed = await addFoodDialog
    .waitFor({ state: 'hidden', timeout: 1000 })
    .then(() => true)
    .catch(() => false)

  if (dialogClosed) {
    await ensureMealExpanded(page, meal)
  }
}

async function clickNavButton(page: Page, name: RegExp) {
  const bottomNavButton = page.locator('nav').last().getByRole('button', { name }).first()
  const button = (await bottomNavButton.isVisible().catch(() => false))
    ? bottomNavButton
    : page.getByRole('button', { name }).first()
  await expect(button).toBeVisible()
  await safeClick(button)
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
  getAddFoodDialog,
  getAddFoodSearchInput,
  getSelectedFoodCard,
  getSelectedFoodServingMeta,
  getSettingsCalorieTargetInput,
  getSettingsTargetsForm,
  goToLog,
  goToSettings,
  goToWeight,
  openMealSheet,
  resetApp,
  clearOriginData,
  safeClick,
  safeFill,
  safeSelectOption,
}
