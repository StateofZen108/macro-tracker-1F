import type { FoodSnapshot } from '../../types'

export interface RecipeIngredient {
  id: string
  foodId?: string
  snapshot: FoodSnapshot
  servings: number
  createdAt: string
}

export interface Recipe {
  id: string
  name: string
  defaultServings: number
  servingsLabel?: string
  ingredients: RecipeIngredient[]
  notes?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
