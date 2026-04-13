import type { FoodLogEntry, MealTemplate, MealType } from '../../types'
import type { SavedMeal, SavedMealEntry } from './types'

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildSavedMealEntries(entries: Array<FoodLogEntry | SavedMealEntry>, now: string): SavedMealEntry[] {
  return entries.map((entry, index) => ({
    id: 'date' in entry ? crypto.randomUUID() : entry.id,
    foodId: entry.foodId,
    snapshot: entry.snapshot,
    servings: entry.servings,
    createdAt: 'date' in entry ? new Date(Date.parse(now) + index).toISOString() : entry.createdAt,
  }))
}

export function matchesSavedMealQuery(savedMeal: SavedMeal, query: string): boolean {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) {
    return true
  }

  return [
    savedMeal.name,
    savedMeal.notes ?? '',
    ...savedMeal.entries.map((entry) => entry.snapshot.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
}

export function migrateMealTemplateToSavedMeal(template: MealTemplate): SavedMeal {
  return {
    id: template.id,
    name: template.name,
    defaultMeal: template.defaultMeal,
    entries: template.entries.map((entry) => ({
      id: entry.id,
      foodId: entry.foodId,
      snapshot: entry.snapshot,
      servings: entry.servings,
      createdAt: entry.createdAt,
    })),
    usageCount: template.usageCount,
    notes: template.notes,
    archivedAt: template.archivedAt,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    deletedAt: template.deletedAt,
  }
}

export function migrateMealTemplatesToSavedMeals(templates: MealTemplate[]): SavedMeal[] {
  return templates.map(migrateMealTemplateToSavedMeal)
}

export function buildSavedMealFromLogEntries(input: {
  name: string
  defaultMeal?: MealType
  entries: FoodLogEntry[]
  notes?: string
  now?: string
}): SavedMeal {
  const now = input.now ?? new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    defaultMeal: input.defaultMeal,
    entries: buildSavedMealEntries(input.entries, now),
    usageCount: 0,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function cloneSavedMealToLogEntries(input: {
  savedMeal: SavedMeal
  date: string
  meal?: MealType
  now?: string
}): FoodLogEntry[] {
  const now = input.now ?? new Date().toISOString()
  const meal = input.meal ?? input.savedMeal.defaultMeal ?? 'breakfast'

  return input.savedMeal.entries.map((entry, index) => ({
    id: crypto.randomUUID(),
    foodId: entry.foodId,
    snapshot: entry.snapshot,
    date: input.date,
    meal,
    servings: entry.servings,
    createdAt: new Date(Date.parse(now) + index).toISOString(),
  }))
}
