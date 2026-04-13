/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('label OCR extraction adapter', () => {
  it('maps provider payloads into a review session the app can edit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'OCR draft ready for review.',
        candidate: {
          name: 'OCR Oats',
          brand: 'Test Brand',
          servingSize: 55,
          servingUnit: 'g',
          calories: 210,
          protein: 8,
          carbs: 33,
          fat: 4,
          fiber: 5,
        },
        fields: {
          servingSizeText: { value: '55 g', sourceText: '55 g' },
          calories: { value: 210, sourceText: '210 kcal' },
          protein: { value: 8, sourceText: '8 g' },
          carbs: { value: 33, sourceText: '33 g' },
          fat: { value: 4, sourceText: '4 g' },
          fiber: { value: 5, sourceText: '5 g' },
          sugar: { value: 1, sourceText: '1 g' },
          sodium: { value: 120, sourceText: '120 mg' },
        },
        warnings: [{ message: 'Serving size was inferred from OCR.' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { extractNutritionLabel } = await import('../../src/utils/labelOcr')
    const file = new File(['fake-image'], 'label.png', { type: 'image/png' })
    const result = await extractNutritionLabel(file)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.data.foodDraft).toMatchObject({
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
      source: 'api',
    })
    expect(result.data.foodDraft.labelNutrition?.fields).toHaveLength(7)
    expect(result.data.warnings).toContain('Serving size was inferred from OCR.')
  })
})
