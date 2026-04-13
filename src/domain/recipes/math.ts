import type { FoodSnapshot, NutrientProfileV1, Recipe } from '../../types'

function divideProfile(profile: NutrientProfileV1 | undefined, divisor: number): NutrientProfileV1 | undefined {
  if (!profile || divisor <= 0) {
    return profile
  }

  return {
    basis: 'serving',
    values: Object.fromEntries(
      Object.entries(profile.values).map(([key, amount]) => [
        key,
        amount
          ? {
              ...amount,
              value: amount.value / divisor,
            }
          : amount,
      ]),
    ) as NutrientProfileV1['values'],
  }
}

export function buildRecipeTotals(
  ingredients: Array<{ snapshot: FoodSnapshot; servings: number }>,
  yieldServings: number,
): NutrientProfileV1 | undefined {
  if (!ingredients.length || yieldServings <= 0) {
    return undefined
  }

  const totals = new Map<string, { unit: 'kcal' | 'g' | 'mg' | 'mcg'; value: number }>()
  for (const ingredient of ingredients) {
    const nutrients = ingredient.snapshot.nutrients?.values ?? {}
    for (const [key, amount] of Object.entries(nutrients)) {
      if (!amount) {
        continue
      }

      const current = totals.get(key)
      totals.set(key, {
        unit: amount.unit,
        value: (current?.value ?? 0) + amount.value * ingredient.servings,
      })
    }
  }

  return divideProfile(
    {
      basis: 'serving',
      values: Object.fromEntries(
        [...totals.entries()].map(([key, amount]) => [
          key,
          { key: key as keyof NutrientProfileV1['values'], unit: amount.unit, value: amount.value },
        ]),
      ) as NutrientProfileV1['values'],
    },
    yieldServings,
  )
}

export function buildRecipeSnapshot(recipe: Recipe): FoodSnapshot {
  const totalCalories = recipe.ingredients.reduce(
    (sum, ingredient) => sum + ingredient.snapshot.calories * ingredient.servings,
    0,
  )
  const totalProtein = recipe.ingredients.reduce(
    (sum, ingredient) => sum + ingredient.snapshot.protein * ingredient.servings,
    0,
  )
  const totalCarbs = recipe.ingredients.reduce(
    (sum, ingredient) => sum + ingredient.snapshot.carbs * ingredient.servings,
    0,
  )
  const totalFat = recipe.ingredients.reduce(
    (sum, ingredient) => sum + ingredient.snapshot.fat * ingredient.servings,
    0,
  )
  const totalFiber = recipe.ingredients.reduce(
    (sum, ingredient) => sum + (ingredient.snapshot.fiber ?? 0) * ingredient.servings,
    0,
  )
  const divisor = recipe.yieldServings > 0 ? recipe.yieldServings : 1

  return {
    name: recipe.name,
    servingSize: 1,
    servingUnit: recipe.yieldLabel ?? 'recipe serving',
    calories: totalCalories / divisor,
    protein: totalProtein / divisor,
    carbs: totalCarbs / divisor,
    fat: totalFat / divisor,
    fiber: totalFiber > 0 ? totalFiber / divisor : undefined,
    source: 'recipe',
    nutrients: recipe.nutrients,
  }
}
