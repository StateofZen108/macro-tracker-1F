import type {
  CanonicalNutrientKeyV1,
  NutrientDefinitionV1,
  NutrientUnitV1,
} from './types'

export const NUTRIENT_DEFINITIONS_V1: Record<CanonicalNutrientKeyV1, NutrientDefinitionV1> = {
  calories: {
    key: 'calories',
    label: 'Calories',
    defaultUnit: 'kcal',
    category: 'macro',
  },
  protein: {
    key: 'protein',
    label: 'Protein',
    defaultUnit: 'g',
    category: 'macro',
  },
  carbs: {
    key: 'carbs',
    label: 'Carbs',
    defaultUnit: 'g',
    category: 'macro',
  },
  fat: {
    key: 'fat',
    label: 'Fat',
    defaultUnit: 'g',
    category: 'macro',
  },
  fiber: {
    key: 'fiber',
    label: 'Fiber',
    defaultUnit: 'g',
    category: 'macro',
  },
  sugars: {
    key: 'sugars',
    label: 'Sugars',
    defaultUnit: 'g',
    category: 'label',
  },
  addedSugars: {
    key: 'addedSugars',
    label: 'Added sugars',
    defaultUnit: 'g',
    category: 'label',
  },
  sodium: {
    key: 'sodium',
    label: 'Sodium',
    defaultUnit: 'mg',
    category: 'label',
  },
  salt: {
    key: 'salt',
    label: 'Salt',
    defaultUnit: 'g',
    category: 'label',
  },
  saturates: {
    key: 'saturates',
    label: 'Saturates',
    defaultUnit: 'g',
    category: 'label',
  },
  cholesterol: {
    key: 'cholesterol',
    label: 'Cholesterol',
    defaultUnit: 'mg',
    category: 'label',
  },
  potassium: {
    key: 'potassium',
    label: 'Potassium',
    defaultUnit: 'mg',
    category: 'label',
  },
  calcium: {
    key: 'calcium',
    label: 'Calcium',
    defaultUnit: 'mg',
    category: 'label',
  },
  iron: {
    key: 'iron',
    label: 'Iron',
    defaultUnit: 'mg',
    category: 'label',
  },
  vitaminD: {
    key: 'vitaminD',
    label: 'Vitamin D',
    defaultUnit: 'mcg',
    category: 'label',
  },
  caffeine: {
    key: 'caffeine',
    label: 'Caffeine',
    defaultUnit: 'mg',
    category: 'label',
  },
}

const NUTRIENT_ALIASES_V1: Record<string, CanonicalNutrientKeyV1> = {
  calorie: 'calories',
  calories: 'calories',
  energy: 'calories',
  protein: 'protein',
  carb: 'carbs',
  carbs: 'carbs',
  carbohydrate: 'carbs',
  carbohydrates: 'carbs',
  fat: 'fat',
  fiber: 'fiber',
  fibre: 'fiber',
  sugar: 'sugars',
  sugars: 'sugars',
  addedsugar: 'addedSugars',
  addedsugars: 'addedSugars',
  sodium: 'sodium',
  salt: 'salt',
  saturatedfat: 'saturates',
  saturates: 'saturates',
  cholesterol: 'cholesterol',
  potassium: 'potassium',
  calcium: 'calcium',
  iron: 'iron',
  vitamind: 'vitaminD',
  caffeine: 'caffeine',
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isCanonicalNutrientKeyV1(value: string): value is CanonicalNutrientKeyV1 {
  return Object.hasOwn(NUTRIENT_DEFINITIONS_V1, value)
}

export function canonicalizeNutrientKeyV1(
  value: string | null | undefined,
): CanonicalNutrientKeyV1 | null {
  if (!value) {
    return null
  }

  const normalized = normalizeKey(value)
  if (!normalized) {
    return null
  }

  if (isCanonicalNutrientKeyV1(normalized)) {
    return normalized
  }

  return NUTRIENT_ALIASES_V1[normalized] ?? null
}

export function getDefaultNutrientUnitV1(key: CanonicalNutrientKeyV1): NutrientUnitV1 {
  return NUTRIENT_DEFINITIONS_V1[key].defaultUnit
}
