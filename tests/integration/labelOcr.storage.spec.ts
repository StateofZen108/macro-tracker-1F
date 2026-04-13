/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('label OCR food storage', () => {
  it('exports OCR-reviewed food fields into the backup payload', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveFoods, loadFoods } = await import('../../src/utils/storage/foods')
    const { exportBackupFile, validateBackupText } = await import('../../src/utils/storage/importExport')

    await initializeStorage()
    await saveFoods([
      {
        id: 'ocr-oats',
        name: 'OCR Oats',
        brand: 'Test Brand',
        servingSize: 55,
        servingUnit: 'g',
        calories: 210,
        protein: 8,
        carbs: 33,
        fat: 4,
        fiber: 5,
        sugars: 1,
        sodium: 120,
        labelNutrition: {
          fields: [
            { normalizedKey: 'calories', rawLabel: 'Calories', value: 210, unit: 'kcal' },
            { normalizedKey: 'protein', rawLabel: 'Protein', value: 8, unit: 'g' },
            { normalizedKey: 'sugars', rawLabel: 'Sugars', value: 1, unit: 'g' },
            { normalizedKey: 'sodium', rawLabel: 'Sodium', value: 120, unit: 'mg' },
            { rawLabel: 'Salt', value: 1.2, unit: 'g' },
          ],
          servingSizeText: '55 g',
          locale: 'unknown',
          source: 'label_ocr',
          reviewedAt: '2026-04-11T09:00:00.000Z',
        },
        source: 'api',
        usageCount: 0,
        createdAt: '2026-04-11T09:00:00.000Z',
        updatedAt: '2026-04-11T09:00:00.000Z',
      },
    ])

    const exported = exportBackupFile()
    expect(exported.ok).toBe(true)
    if (!exported.ok) {
      return
    }

    expect(loadFoods().find((food) => food.name === 'OCR Oats')?.labelNutrition?.fields).toHaveLength(5)

    const preview = validateBackupText(JSON.stringify(exported.data))
    expect(preview.ok).toBe(true)
    if (!preview.ok) {
      return
    }

    const exportedFood = preview.data.backup.foods.find((food) => food.name === 'OCR Oats')
    expect(exportedFood?.labelNutrition?.fields).toHaveLength(5)
    expect(exportedFood?.labelNutrition?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalizedKey: 'sugars', value: 1, unit: 'g' }),
        expect.objectContaining({ normalizedKey: 'sodium', value: 120, unit: 'mg' }),
      ]),
    )
    expect(exportedFood?.labelNutrition?.source).toBe('label_ocr')
  })
})
