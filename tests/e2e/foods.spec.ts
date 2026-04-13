import { expect, test } from '@playwright/test'
import { addFoodToMeal, ensureMealExpanded, entryRow, goToLog, goToSettings, openMealSheet, resetApp } from './helpers/app'

const OCR_SESSION_RESPONSE = {
  session: {
    provider: 'gemini',
    requiresReview: true,
    warnings: ['Serving size was inferred from the label image.'],
    fieldCandidates: [
      {
        normalizedKey: 'calories',
        rawLabel: 'Calories',
        value: 210,
        unit: 'kcal',
        sourceText: '210 kcal',
        confidence: 0.92,
      },
      {
        normalizedKey: 'protein',
        rawLabel: 'Protein',
        value: 8,
        unit: 'g',
        sourceText: '8 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'carbs',
        rawLabel: 'Carbs',
        value: 33,
        unit: 'g',
        sourceText: '33 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'fat',
        rawLabel: 'Fat',
        value: 4,
        unit: 'g',
        sourceText: '4 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'fiber',
        rawLabel: 'Fiber',
        value: 5,
        unit: 'g',
        sourceText: '5 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'sodium',
        rawLabel: 'Sodium',
        value: 120,
        unit: 'mg',
        sourceText: '120 mg',
        confidence: 0.78,
      },
    ],
    unmappedFields: [
      {
        rawLabel: 'Salt',
        value: 1.2,
        unit: 'g',
        sourceText: '1.2 g',
        confidence: 0.7,
      },
    ],
    foodDraft: {
      name: 'OCR Oats',
      brand: 'Test Brand',
      servingSize: 2,
      servingUnit: 'cookies',
      calories: 210,
      protein: 8,
      carbs: 33,
      fat: 4,
      fiber: 5,
      sodium: 120,
      labelNutrition: {
        fields: [],
        servingSizeText: '2 cookies (28 g)',
        locale: 'unknown',
        source: 'label_ocr',
        reviewedAt: '2026-04-12T09:00:00.000Z',
      },
      barcode: '0123456789012',
      source: 'api',
    },
  },
}

const OCR_SESSION_NO_METRIC_RESPONSE = {
  session: {
    provider: 'gemini',
    requiresReview: true,
    warnings: [],
    fieldCandidates: [
      {
        normalizedKey: 'calories',
        rawLabel: 'Calories',
        value: 250,
        unit: 'kcal',
        sourceText: '250 kcal',
        confidence: 0.92,
      },
      {
        normalizedKey: 'protein',
        rawLabel: 'Protein',
        value: 10,
        unit: 'g',
        sourceText: '10 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'carbs',
        rawLabel: 'Carbs',
        value: 30,
        unit: 'g',
        sourceText: '30 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'fat',
        rawLabel: 'Fat',
        value: 8,
        unit: 'g',
        sourceText: '8 g',
        confidence: 0.92,
      },
    ],
    unmappedFields: [],
    foodDraft: {
      name: 'OCR Bar',
      brand: 'Test Brand',
      servingSize: 1,
      servingUnit: 'bar',
      calories: 250,
      protein: 10,
      carbs: 30,
      fat: 8,
      labelNutrition: {
        fields: [],
        servingSizeText: '1 bar',
        locale: 'unknown',
        source: 'label_ocr',
        reviewedAt: '2026-04-12T09:00:00.000Z',
      },
      source: 'api',
    },
  },
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('custom food history stays frozen after edit and archive', async ({ page }) => {
  await goToSettings(page)
  await page.getByRole('button', { name: /new food/i }).click()
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })

  await createFoodSheet.getByLabel('Food name').fill('Beta Chicken')
  await createFoodSheet.getByLabel('Serving size').fill('1')
  await createFoodSheet.getByLabel('Serving unit').fill('serving')
  await createFoodSheet.getByLabel('Calories').fill('200')
  await createFoodSheet.getByLabel('Protein (g)').fill('30')
  await createFoodSheet.getByLabel('Carbs (g)').fill('5')
  await createFoodSheet.getByLabel('Fat (g)').fill('4')
  await createFoodSheet.getByRole('button', { name: /save food/i }).click()

  await goToLog(page)
  await addFoodToMeal(page, 'Beta Chicken')

  const betaChickenRow = entryRow(page, 'Beta Chicken')
  await expect(betaChickenRow).toContainText('200 cal')

  await goToSettings(page)
  await page.getByRole('button', { name: /edit beta chicken/i }).click()
  const editFoodSheet = page.getByRole('dialog', { name: /edit food/i })
  await editFoodSheet.getByLabel('Calories').fill('400')
  await editFoodSheet.getByRole('button', { name: /save changes/i }).click()
  await page.getByRole('button', { name: /archive beta chicken/i }).click()

  await goToLog(page)
  await ensureMealExpanded(page)
  await expect(betaChickenRow).toContainText('200 cal')

  await page.getByRole('button', { name: /add food to breakfast/i }).click()
  await page.getByPlaceholder('Search your saved foods').fill('Beta Chicken')
  await expect(page.getByText(/no local foods matched that search/i)).toBeVisible()
})

test('duplicate food creation is blocked before saving a second copy', async ({ page }) => {
  await goToSettings(page)
  await page.getByRole('button', { name: /new food/i }).click()
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })

  await createFoodSheet.getByLabel('Food name').fill('Banana')
  await createFoodSheet.getByLabel('Serving size').fill('1')
  await createFoodSheet.getByLabel('Serving unit').fill('medium')
  await createFoodSheet.getByLabel('Calories').fill('105')
  await createFoodSheet.getByLabel('Protein (g)').fill('1.3')
  await createFoodSheet.getByLabel('Carbs (g)').fill('27')
  await createFoodSheet.getByLabel('Fat (g)').fill('0.4')
  await createFoodSheet.getByRole('button', { name: /save food/i }).click()

  await expect(createFoodSheet.getByText(/banana already exists in your saved foods/i)).toBeVisible()
})

test('dirty food form dismissal requires confirmation', async ({ page }) => {
  await goToSettings(page)
  await page.getByRole('button', { name: /new food/i }).click()
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })
  await createFoodSheet.getByLabel('Food name').fill('Unsaved Draft')
  await createFoodSheet.getByRole('button', { name: /close sheet/i }).click()
  await expect(page.getByRole('alertdialog', { name: /discard changes/i })).toBeVisible()
  await page.getByRole('button', { name: /keep editing/i }).click()
  await expect(createFoodSheet).toBeVisible()
  await createFoodSheet.getByRole('button', { name: /close sheet/i }).click()
  await page.getByRole('button', { name: /^discard$/i }).click()
  await expect(createFoodSheet).toBeHidden()
})

test('add-food sheet keeps custom-food and barcode flows available while OCR wiring is pending', async ({ page }) => {
  await openMealSheet(page)
  await expect(page.getByRole('button', { name: /create custom food/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /scan barcode/i })).toBeEnabled()
  await expect(page.getByRole('button', { name: /scan nutrition label/i })).toBeEnabled()

  await page.getByRole('button', { name: /create custom food/i }).click()
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await addFoodSheet.getByLabel('Food name').fill('Pocket Oats')
  await addFoodSheet.getByLabel('Serving size').fill('40')
  await addFoodSheet.getByLabel('Serving unit').fill('g')
  await addFoodSheet.getByLabel('Calories').fill('152')
  await addFoodSheet.getByLabel('Protein (g)').fill('5.3')
  await addFoodSheet.getByLabel('Carbs (g)').fill('27')
  await addFoodSheet.getByLabel('Fat (g)').fill('2.6')
  await addFoodSheet.getByRole('button', { name: /save custom food/i }).click()

  await expect(page.getByText('Selected food')).toBeVisible()
  await expect(addFoodSheet.getByText('Pocket Oats').first()).toBeVisible()
  await expect(addFoodSheet.getByRole('button', { name: /add to meal/i })).toBeVisible()
})

test('nutrition-label OCR review saves a new food and logs it', async ({ page }) => {
  await page.route('**/api/label-ocr/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OCR_SESSION_RESPONSE),
    })
  })

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await addFoodSheet.getByRole('button', { name: /scan nutrition label/i }).click()
  await addFoodSheet
    .locator('input[type="file"]')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from('ocr-label') })
  await addFoodSheet.getByRole('button', { name: /review nutrition label/i }).click()

  await expect(addFoodSheet.getByText(/review extracted label/i)).toBeVisible()
  await expect(addFoodSheet.getByLabel('Food name')).toHaveValue('OCR Oats')
  await expect(addFoodSheet.getByLabel('Serving size')).toHaveValue('28')
  await expect(addFoodSheet.getByLabel('Serving unit')).toHaveValue('g')
  await addFoodSheet.getByRole('button', { name: /save reviewed food/i }).click()

  await expect(addFoodSheet.getByText('Selected food')).toBeVisible()
  await expect(addFoodSheet.getByText('OCR Oats').first()).toBeVisible()
  await expect(addFoodSheet.getByText('Test Brand • 28g').first()).toBeVisible()
  await addFoodSheet.getByRole('button', { name: /add to meal/i }).click()

  await goToLog(page)
  await ensureMealExpanded(page)
  await expect(entryRow(page, 'OCR Oats')).toContainText('210 cal')
})

test('nutrition-label OCR review warns when the label has no gram or ml equivalent', async ({ page }) => {
  await page.route('**/api/label-ocr/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OCR_SESSION_NO_METRIC_RESPONSE),
    })
  })

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await addFoodSheet.getByRole('button', { name: /scan nutrition label/i }).click()
  await addFoodSheet
    .locator('input[type="file"]')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from('ocr-label') })
  await addFoodSheet.getByRole('button', { name: /review nutrition label/i }).click()

  await expect(addFoodSheet.getByLabel('Serving size')).toHaveValue('1')
  await expect(addFoodSheet.getByLabel('Serving unit')).toHaveValue('bar')
  await expect(
    addFoodSheet.getByText(/no gram or ml serving size was found on this label/i),
  ).toBeVisible()
})

test('nutrition-label review blocks save when a required field is cleared', async ({ page }) => {
  await page.route('**/api/label-ocr/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OCR_SESSION_RESPONSE),
    })
  })

  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await addFoodSheet.getByRole('button', { name: /scan nutrition label/i }).click()
  await addFoodSheet
    .locator('input[type="file"]')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from('ocr-label') })
  await addFoodSheet.getByRole('button', { name: /review nutrition label/i }).click()

  await addFoodSheet.getByLabel('Calories').fill('')
  await expect(addFoodSheet.getByRole('button', { name: /save reviewed food/i })).toBeDisabled()
})
