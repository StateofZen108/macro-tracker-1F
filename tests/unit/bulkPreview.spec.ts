import { describe, expect, it } from 'vitest'
import { buildBulkApplyPreview } from '../../src/domain/logs/bulkPreview'
import type { FoodLogEntry } from '../../src/types'

function entry(id: string, name: string, calories: number): FoodLogEntry {
  return {
    id,
    date: '2026-04-10',
    meal: 'breakfast',
    servings: 1,
    createdAt: '2026-04-10T08:00:00.000Z',
    updatedAt: '2026-04-10T08:00:00.000Z',
    snapshot: {
      name,
      servingSize: 1,
      servingUnit: 'entry',
      calories,
      protein: 10,
      carbs: 20,
      fat: 5,
      source: 'custom',
    },
  }
}

describe('bulk preview', () => {
  it('counts entries and calories for append preview', () => {
    const preview = buildBulkApplyPreview('2026-04-10', [entry('new', 'Apple', 95)], [], 'breakfast')
    expect(preview.incomingEntryCount).toBe(1)
    expect(preview.existingEntryCount).toBe(0)
    expect(preview.incomingCalories).toBe(95)
    expect(preview.modeRecommendation).toBe('append')
  })

  it('recommends replace when overlaps exist', () => {
    const preview = buildBulkApplyPreview(
      '2026-04-10',
      [entry('new', 'Banana', 105)],
      [entry('old', 'Banana', 105)],
      'breakfast',
    )
    expect(preview.possibleOverlapCount).toBe(1)
    expect(preview.modeRecommendation).toBe('replaceTarget')
  })
})
