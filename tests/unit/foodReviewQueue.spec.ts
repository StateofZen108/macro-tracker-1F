import { describe, expect, it } from 'vitest'
import type { Food, FoodLogEntry } from '../../src/types'
import { reconcileFoodReviewQueue } from '../../src/domain/foods/reviewQueue'

function buildFood(overrides: Partial<Food> & Pick<Food, 'id' | 'name'>): Food {
  return {
    id: overrides.id,
    name: overrides.name,
    servingSize: overrides.servingSize ?? 1,
    servingUnit: overrides.servingUnit ?? 'serving',
    calories: overrides.calories ?? 100,
    protein: overrides.protein ?? 10,
    carbs: overrides.carbs ?? 10,
    fat: overrides.fat ?? 5,
    source: overrides.source ?? 'custom',
    usageCount: overrides.usageCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-04-16T08:00:00.000Z',
    archivedAt: overrides.archivedAt,
  }
}

function buildLogEntry(
  overrides: Partial<FoodLogEntry> & Pick<FoodLogEntry, 'id' | 'date' | 'meal' | 'snapshot'>,
): FoodLogEntry {
  return {
    id: overrides.id,
    date: overrides.date,
    meal: overrides.meal,
    snapshot: overrides.snapshot,
    servings: overrides.servings ?? 1,
    createdAt: overrides.createdAt ?? `${overrides.date}T08:00:00.000Z`,
    foodId: overrides.foodId,
    updatedAt: overrides.updatedAt,
    deletedAt: overrides.deletedAt,
    needsReview: overrides.needsReview,
    reviewItemId: overrides.reviewItemId,
  }
}

describe('food review queue reconciliation', () => {
  it('creates a persistent orphaned-entry review item and stamps the log entry', () => {
    const reconciliation = reconcileFoodReviewQueue({
      foods: [],
      logsByDate: {
        '2026-04-16': [
          buildLogEntry({
            id: 'entry-1',
            date: '2026-04-16',
            meal: 'breakfast',
            foodId: 'missing-food',
            snapshot: {
              name: 'Missing chicken',
              calories: 120,
              protein: 25,
              carbs: 0,
              fat: 2,
              fiber: 0,
              servingSize: 1,
              servingUnit: 'serving',
              source: 'custom',
            },
          }),
        ],
      },
      queue: [],
    })

    expect(reconciliation.createdReviewItemIds).toHaveLength(1)
    expect(reconciliation.queue[0]?.source).toBe('orphaned_log_entry')
    expect(reconciliation.logsByDate['2026-04-16']?.[0]?.needsReview).toBe(true)
    expect(reconciliation.logsByDate['2026-04-16']?.[0]?.reviewItemId).toBe(
      reconciliation.queue[0]?.id,
    )
  })

  it('resolves an orphaned-entry review item after the food is restored or relinked', () => {
    const pending = reconcileFoodReviewQueue({
      foods: [],
      logsByDate: {
        '2026-04-16': [
          buildLogEntry({
            id: 'entry-1',
            date: '2026-04-16',
            meal: 'breakfast',
            foodId: 'food-1',
            snapshot: {
              name: 'Chicken',
              calories: 120,
              protein: 25,
              carbs: 0,
              fat: 2,
              fiber: 0,
              servingSize: 1,
              servingUnit: 'serving',
              source: 'custom',
            },
          }),
        ],
      },
      queue: [],
    })

    const resolved = reconcileFoodReviewQueue({
      foods: [buildFood({ id: 'food-1', name: 'Chicken' })],
      logsByDate: pending.logsByDate,
      queue: pending.queue,
    })

    expect(resolved.resolvedReviewItemIds).toHaveLength(1)
    expect(resolved.queue[0]?.status).toBe('resolved')
    expect(resolved.logsByDate['2026-04-16']?.[0]?.needsReview).toBeUndefined()
    expect(resolved.logsByDate['2026-04-16']?.[0]?.reviewItemId).toBeUndefined()
  })
})
