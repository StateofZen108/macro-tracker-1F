import { expect, test } from '@playwright/test'
import {
  addFoodToMeal,
  ensureMealExpanded,
  entryRow,
  getAddFoodSearchInput,
  getSelectedFoodCard,
  getSelectedFoodServingMeta,
  goToLog,
  goToSettings,
  openMealSheet,
  resetApp,
  safeClick,
  safeFill,
} from './helpers/app'

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

const VALID_LABEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('custom food history stays frozen after edit and archive', async ({ page }) => {
  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /new food/i }))
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })

  await safeFill(createFoodSheet.getByLabel('Food name'), 'Beta Chicken')
  await safeFill(createFoodSheet.getByLabel('Serving size'), '1')
  await safeFill(createFoodSheet.getByLabel('Serving unit'), 'serving')
  await safeFill(createFoodSheet.getByLabel('Calories'), '200')
  await safeFill(createFoodSheet.getByLabel('Protein (g)'), '30')
  await safeFill(createFoodSheet.getByLabel('Carbs (g)'), '5')
  await safeFill(createFoodSheet.getByLabel('Fat (g)'), '4')
  await safeClick(createFoodSheet.getByRole('button', { name: /save food/i }))

  await goToLog(page)
  await addFoodToMeal(page, 'Beta Chicken')

  const betaChickenRow = entryRow(page, 'Beta Chicken')
  await expect(betaChickenRow).toContainText('200 cal')

  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /edit beta chicken/i }))
  const editFoodSheet = page.getByRole('dialog', { name: /edit food/i })
  await safeFill(editFoodSheet.getByLabel('Calories'), '400')
  await safeClick(editFoodSheet.getByRole('button', { name: /save changes/i }))
  await safeClick(page.getByRole('button', { name: /archive beta chicken/i }))

  await goToLog(page)
  await ensureMealExpanded(page)
  await expect(betaChickenRow).toContainText('200 cal')

  await safeClick(page.getByRole('button', { name: /add food to breakfast/i }))
  await safeFill(await getAddFoodSearchInput(page), 'Beta Chicken')
  await expect(page.getByText(/no local foods matched that search/i)).toBeVisible()
})

test('duplicate food creation is blocked before saving a second copy', async ({ page }) => {
  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /new food/i }))
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })

  await safeFill(createFoodSheet.getByLabel('Food name'), 'Banana')
  await safeFill(createFoodSheet.getByLabel('Serving size'), '1')
  await safeFill(createFoodSheet.getByLabel('Serving unit'), 'medium')
  await safeFill(createFoodSheet.getByLabel('Calories'), '105')
  await safeFill(createFoodSheet.getByLabel('Protein (g)'), '1.3')
  await safeFill(createFoodSheet.getByLabel('Carbs (g)'), '27')
  await safeFill(createFoodSheet.getByLabel('Fat (g)'), '0.4')
  await safeClick(createFoodSheet.getByRole('button', { name: /save food/i }))

  await expect(createFoodSheet.getByText(/banana already exists in your saved foods/i)).toBeVisible()
})

test('dirty food form dismissal requires confirmation', async ({ page }) => {
  await goToSettings(page)
  await safeClick(page.getByRole('button', { name: /new food/i }))
  const createFoodSheet = page.getByRole('dialog', { name: /create food/i })
  await safeFill(createFoodSheet.getByLabel('Food name'), 'Unsaved Draft')
  await safeClick(createFoodSheet.getByRole('button', { name: /close sheet/i }))
  await expect(page.getByRole('alertdialog', { name: /discard changes/i })).toBeVisible()
  await safeClick(page.getByRole('button', { name: /keep editing/i }))
  await expect(createFoodSheet).toBeVisible()
  await safeClick(createFoodSheet.getByRole('button', { name: /close sheet/i }))
  await safeClick(page.getByRole('button', { name: /^discard$/i }))
  await expect(createFoodSheet).toBeHidden()
})

test('add-food sheet keeps custom-food and barcode flows available while OCR wiring is pending', async ({ page }) => {
  await openMealSheet(page)
  await expect(page.getByRole('button', { name: /create custom food/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /scan barcode/i })).toBeEnabled()
  await expect(page.getByRole('button', { name: /scan nutrition label/i })).toBeEnabled()

  await safeClick(page.getByRole('button', { name: /create custom food/i }))
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await safeFill(addFoodSheet.getByLabel('Food name'), 'Pocket Oats')
  await safeFill(addFoodSheet.getByLabel('Serving size'), '40')
  await safeFill(addFoodSheet.getByLabel('Serving unit'), 'g')
  await safeFill(addFoodSheet.getByLabel('Calories'), '152')
  await safeFill(addFoodSheet.getByLabel('Protein (g)'), '5.3')
  await safeFill(addFoodSheet.getByLabel('Carbs (g)'), '27')
  await safeFill(addFoodSheet.getByLabel('Fat (g)'), '2.6')
  await safeClick(addFoodSheet.getByRole('button', { name: /save custom food/i }))

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
  await safeClick(addFoodSheet.getByRole('button', { name: /scan nutrition label/i }))
  await addFoodSheet
    .getByTestId('ocr-gallery-input')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: VALID_LABEL_PNG })
  await safeClick(addFoodSheet.getByRole('button', { name: /review nutrition label/i }))

  await expect(addFoodSheet.getByText(/review extracted label/i)).toBeVisible()
  await expect(addFoodSheet.getByLabel('Food name')).toHaveValue('OCR Oats')
  await expect(addFoodSheet.getByRole('button', { name: /28 g label/i })).toBeVisible()
  await expect(addFoodSheet.getByRole('button', { name: /per 100 g label/i })).toBeVisible()
  await safeClick(addFoodSheet.getByRole('button', { name: /save reviewed food/i }))

  const selectedFoodCard = getSelectedFoodCard(page)
  await expect(selectedFoodCard.getByText('Selected food')).toBeVisible()
  await expect(selectedFoodCard.getByText('OCR Oats')).toBeVisible()
  await expect(selectedFoodCard.getByText('Test Brand')).toBeVisible()
  await expect(getSelectedFoodServingMeta(page)).toContainText('2 cookies (28g)')
  await safeClick(addFoodSheet.getByRole('button', { name: /^2x$/i }))
  await expect(getSelectedFoodServingMeta(page)).toContainText('4 cookies (56g)')
  await expect(page.getByTestId('selected-food-serving-basis')).toContainText('1x = 2 cookies (28g)')
  await expect(selectedFoodCard.getByText('420 cal | 16P | 66C | 8F')).toBeVisible()
  await safeClick(addFoodSheet.getByRole('button', { name: /add to meal/i }))
  await safeClick(addFoodSheet.getByRole('button', { name: /close sheet/i }))
  await expect(addFoodSheet).toBeHidden()

  await goToLog(page)
  await ensureMealExpanded(page)
  await expect(entryRow(page, 'OCR Oats')).toContainText('420 cal')
})

test('selected saved-food preview updates macros and fallback serving meta as servings change', async ({
  page,
}) => {
  await openMealSheet(page)
  const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
  await safeFill(await getAddFoodSearchInput(page), 'Banana')
  await safeClick(addFoodSheet.getByRole('button', { name: /banana/i }).first())

  const selectedFoodCard = getSelectedFoodCard(page)
  await expect(selectedFoodCard).toBeVisible()
  await expect(getSelectedFoodServingMeta(page)).toContainText('1medium')
  await expect(selectedFoodCard.getByText('105 cal | 1P | 27C | 0F')).toBeVisible()

  await safeClick(addFoodSheet.getByRole('button', { name: /^2x$/i }))
  await expect(getSelectedFoodServingMeta(page)).toContainText('2medium')
  await expect(page.getByTestId('selected-food-serving-basis')).toBeHidden()
  await expect(selectedFoodCard.getByText('210 cal | 3P | 54C | 1F')).toBeVisible()
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
  await safeClick(addFoodSheet.getByRole('button', { name: /scan nutrition label/i }))
  await addFoodSheet
    .getByTestId('ocr-gallery-input')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: VALID_LABEL_PNG })
  await safeClick(addFoodSheet.getByRole('button', { name: /review nutrition label/i }))

  await expect(addFoodSheet.getByRole('button', { name: /enter manually/i })).toBeVisible()
  await expect(
    addFoodSheet.getByText(
      /serving basis could not be resolved\. enter a serving size before saving\./i,
    ),
  ).toBeVisible()
  await expect(addFoodSheet.getByRole('button', { name: /fix and save/i })).toBeDisabled()
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
  await safeClick(addFoodSheet.getByRole('button', { name: /scan nutrition label/i }))
  await addFoodSheet
    .getByTestId('ocr-gallery-input')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: VALID_LABEL_PNG })
  await safeClick(addFoodSheet.getByRole('button', { name: /review nutrition label/i }))

  await safeFill(addFoodSheet.getByLabel('Calories'), '')
  await expect(addFoodSheet.getByRole('button', { name: /save reviewed food/i })).toBeDisabled()
})

