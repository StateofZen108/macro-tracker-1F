import { describe, expect, it } from 'vitest'
import { buildBootstrapCounts, buildBootstrapStatusSummary } from '../../server/sync/store'

describe('server sync bootstrap counts', () => {
  it('maps meal_templates rows to savedMeals without exposing the legacy alias', () => {
    const counts = buildBootstrapCounts([
      {
        scope: 'meal_templates',
        record_id: 'template-1',
      },
      {
        scope: 'recipes',
        record_id: 'recipe-1',
      },
      {
        scope: 'favorite_foods',
        record_id: 'favorite-1',
      },
      {
        scope: 'food_log_entries',
        record_id: 'entry-1',
        payload_json: { date: '2026-04-12' },
      },
      {
        scope: 'food_log_entries',
        record_id: 'entry-2',
        payload_json: { date: '2026-04-12' },
      },
    ])

    expect(counts).toMatchObject({
      savedMeals: 1,
      recipes: 1,
      favoriteFoods: 1,
      logEntries: 2,
      logDays: 1,
    })
    expect('mealTemplates' in counts).toBe(false)
  })

  it('treats saved meal rows as non-empty cloud state in the product-facing summary', () => {
    const summary = buildBootstrapStatusSummary(
      [
        {
          scope: 'meal_templates',
          record_id: 'template-1',
        },
      ],
      true,
    )

    expect(summary.bootstrapCompleted).toBe(true)
    expect(summary.cloudEmpty).toBe(false)
    expect(summary.cloudCounts.savedMeals).toBe(1)
    expect('mealTemplates' in summary.cloudCounts).toBe(false)
    expect('mealTemplates' in summary.localCounts).toBe(false)
  })
})
