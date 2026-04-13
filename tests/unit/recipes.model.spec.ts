import { describe, expect, it } from 'vitest'
import { buildRecipeFromEntries, matchesRecipeQuery, rollupRecipeNutrition } from '../../src/domain/recipes'
import type { FoodLogEntry } from '../../src/types'

function buildEntry(name: string, calories: number, protein: number): FoodLogEntry {
  return {
    id: crypto.randomUUID(),
    date: '2026-04-12',
    meal: 'dinner',
    servings: 1,
    createdAt: '2026-04-12T00:00:00.000Z',
    snapshot: {
      name,
      servingSize: 1,
      servingUnit: 'serving',
      calories,
      protein,
      carbs: 10,
      fat: 5,
      source: 'custom',
    },
  }
}

describe('recipe helpers', () => {
  it('rolls up ingredient nutrition and scales by servings', () => {
    const recipe = buildRecipeFromEntries({
      name: 'Chicken Pasta',
      defaultServings: 2,
      entries: [buildEntry('Chicken', 200, 30), buildEntry('Pasta', 250, 8)],
      now: '2026-04-12T09:00:00.000Z',
    })

    const totals = rollupRecipeNutrition(recipe)
    const scaled = rollupRecipeNutrition(recipe, 4)

    expect(totals.calories).toBe(450)
    expect(totals.protein).toBe(38)
    expect(scaled.calories).toBe(900)
    expect(scaled.protein).toBe(76)
  })

  it('matches recipes by name, notes, and ingredient names', () => {
    const recipe = buildRecipeFromEntries({
      name: 'Chicken Pasta',
      defaultServings: 2,
      notes: 'Post-gym',
      entries: [buildEntry('Chicken', 200, 30), buildEntry('Pasta', 250, 8)],
    })

    expect(matchesRecipeQuery(recipe, 'pasta')).toBe(true)
    expect(matchesRecipeQuery(recipe, 'post-gym')).toBe(true)
    expect(matchesRecipeQuery(recipe, 'chicken')).toBe(true)
    expect(matchesRecipeQuery(recipe, 'salmon')).toBe(false)
  })
})
