import type { DescribeFoodDraftV1, Food } from '../../types'
import { normalizeFoodSearchText } from './search'

const MULTI_ITEM_PATTERN = /,|\band\b|\+|\bwith\b/i
const MAX_TEXT_LENGTH = 400
const RECOGNIZED_UNITS = new Set([
  'g',
  'gram',
  'grams',
  'kg',
  'ml',
  'l',
  'oz',
  'lb',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'serving',
  'servings',
  'slice',
  'slices',
  'piece',
  'pieces',
  'scoop',
  'scoops',
  'pot',
  'pots',
])

export interface BuildDescribeFoodDraftOptions {
  rawText: string
  locale: 'en-GB' | 'en-US'
  foods: Food[]
  searchFoods: (query: string) => Food[]
}

function normalizeUnit(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (normalized === 'gram' || normalized === 'grams') {
    return 'g'
  }

  if (normalized === 'cups') {
    return 'cup'
  }

  if (normalized === 'servings') {
    return 'serving'
  }

  if (normalized === 'slices') {
    return 'slice'
  }

  if (normalized === 'pieces') {
    return 'piece'
  }

  if (normalized === 'scoops') {
    return 'scoop'
  }

  if (normalized === 'pots') {
    return 'pot'
  }

  return normalized
}

function pickLocalCandidate(foods: Food[], query: string, searchFoods: (query: string) => Food[]): Food | null {
  const activeFoods = foods.filter((food) => !food.archivedAt)
  const normalizedQuery = normalizeFoodSearchText(query)
  if (!normalizedQuery) {
    return null
  }

  const exactMatch =
    activeFoods.find((food) => normalizeFoodSearchText(food.name) === normalizedQuery) ??
    activeFoods.find(
      (food) =>
        normalizeFoodSearchText([food.brand ?? '', food.name].filter(Boolean).join(' ')) === normalizedQuery,
    )
  if (exactMatch) {
    return exactMatch
  }

  return searchFoods(query).find((food) => !food.archivedAt) ?? null
}

export function buildDescribeFoodDraftV1({
  rawText,
  locale,
  foods,
  searchFoods,
}: BuildDescribeFoodDraftOptions): DescribeFoodDraftV1 | null {
  const normalizedText = rawText.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT_LENGTH)
  if (!normalizedText) {
    return null
  }

  const lowerText = normalizedText.toLowerCase()
  const hasMultipleFoods = MULTI_ITEM_PATTERN.test(lowerText)
  const match = normalizedText.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/)

  let amount: number | undefined
  let unit: string | undefined
  let name = normalizedText

  if (match) {
    const parsedAmount = Number.parseFloat(match[1])
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      amount = parsedAmount
    }

    const parsedUnit = normalizeUnit(match[2])
    if (parsedUnit && RECOGNIZED_UNITS.has(parsedUnit)) {
      unit = parsedUnit
      name = match[3].trim()
    } else if (amount !== undefined) {
      name = match[3].trim()
    } else {
      name = normalizedText
      amount = undefined
    }
  }

  const candidateLocalFood = hasMultipleFoods ? null : pickLocalCandidate(foods, name, searchFoods)
  const confidence: DescribeFoodDraftV1['confidence'] =
    candidateLocalFood && normalizeFoodSearchText(candidateLocalFood.name) === normalizeFoodSearchText(name)
      ? 'high'
      : hasMultipleFoods
        ? 'low'
        : amount !== undefined || name.length >= 3
          ? 'medium'
          : 'low'

  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `describe-${Date.now()}`,
    rawText: normalizedText,
    locale,
    confidence,
    reviewMode: candidateLocalFood ? 'local_match' : 'manual_only',
    item: {
      name,
      amount,
      unit,
      candidateLocalFoodId: candidateLocalFood?.id,
      calories: candidateLocalFood?.calories,
      protein: candidateLocalFood?.protein,
      carbs: candidateLocalFood?.carbs,
      fat: candidateLocalFood?.fat,
    },
    createdAt: new Date().toISOString(),
  }
}
