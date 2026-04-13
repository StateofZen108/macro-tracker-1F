import { describe, expect, it } from 'vitest'
import {
  buildSavedMealFromLogEntries,
  cloneSavedMealToLogEntries,
  matchesSavedMealQuery,
  migrateMealTemplateToSavedMeal,
} from '../../src/domain/savedMeals'
import type { FoodLogEntry, MealTemplate } from '../../src/types'

function buildLogEntry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? '2026-04-12',
    meal: overrides.meal ?? 'breakfast',
    servings: overrides.servings ?? 1,
    createdAt: overrides.createdAt ?? '2026-04-12T00:00:00.000Z',
    snapshot: overrides.snapshot ?? {
      name: 'Banana',
      servingSize: 1,
      servingUnit: 'medium',
      calories: 105,
      protein: 1.3,
      carbs: 27,
      fat: 0.4,
      source: 'custom',
    },
    ...overrides,
  }
}

describe('saved meal helpers', () => {
  it('migrates MealTemplate records one-for-one into SavedMeal records', () => {
    const template: MealTemplate = {
      id: 'template-1',
      name: 'Usual breakfast',
      defaultMeal: 'breakfast',
      entries: [
        {
          id: 'template-entry-1',
          snapshot: buildLogEntry().snapshot,
          servings: 1,
          createdAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      usageCount: 4,
      notes: 'High protein',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-11T00:00:00.000Z',
    }

    const savedMeal = migrateMealTemplateToSavedMeal(template)

    expect(savedMeal.id).toBe(template.id)
    expect(savedMeal.entries).toHaveLength(1)
    expect(savedMeal.defaultMeal).toBe('breakfast')
    expect(savedMeal.notes).toBe('High protein')
  })

  it('builds and clones saved meals without mutating food snapshots', () => {
    const savedMeal = buildSavedMealFromLogEntries({
      name: 'Repeat lunch',
      defaultMeal: 'lunch',
      entries: [buildLogEntry({ meal: 'lunch' })],
      now: '2026-04-12T10:00:00.000Z',
    })

    const clonedEntries = cloneSavedMealToLogEntries({
      savedMeal,
      date: '2026-04-13',
      now: '2026-04-13T08:00:00.000Z',
    })

    expect(clonedEntries).toHaveLength(1)
    expect(clonedEntries[0].date).toBe('2026-04-13')
    expect(clonedEntries[0].meal).toBe('lunch')
    expect(clonedEntries[0].snapshot.name).toBe('Banana')
  })

  it('matches saved meals on meal name, notes, and snapshot names', () => {
    const savedMeal = buildSavedMealFromLogEntries({
      name: 'Office lunch',
      entries: [buildLogEntry({ snapshot: { ...buildLogEntry().snapshot, name: 'Chicken Bowl' } })],
      notes: 'Desk meal',
    })

    expect(matchesSavedMealQuery(savedMeal, 'office')).toBe(true)
    expect(matchesSavedMealQuery(savedMeal, 'desk')).toBe(true)
    expect(matchesSavedMealQuery(savedMeal, 'chicken')).toBe(true)
    expect(matchesSavedMealQuery(savedMeal, 'salmon')).toBe(false)
  })
})
