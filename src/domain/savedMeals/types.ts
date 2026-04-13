import type { FoodSnapshot, MealType } from '../../types'

export interface SavedMealEntry {
  id: string
  foodId?: string
  snapshot: FoodSnapshot
  servings: number
  createdAt: string
}

export interface SavedMeal {
  id: string
  name: string
  defaultMeal?: MealType
  entries: SavedMealEntry[]
  usageCount: number
  notes?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
