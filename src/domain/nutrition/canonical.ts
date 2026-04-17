import type {
  CanonicalNutrientKeyV1,
  NutrientDefinitionV1,
  NutrientUnitV1,
} from './types'

export const NUTRIENT_DEFINITIONS_V1: Record<CanonicalNutrientKeyV1, NutrientDefinitionV1> = {
  calories: { key: 'calories', label: 'Calories', defaultUnit: 'kcal', category: 'macro' },
  protein: { key: 'protein', label: 'Protein', defaultUnit: 'g', category: 'macro' },
  carbs: { key: 'carbs', label: 'Carbs', defaultUnit: 'g', category: 'macro' },
  fat: { key: 'fat', label: 'Fat', defaultUnit: 'g', category: 'macro' },
  fiber: { key: 'fiber', label: 'Fiber', defaultUnit: 'g', category: 'macro' },
  sugars: { key: 'sugars', label: 'Sugars', defaultUnit: 'g', category: 'label' },
  addedSugars: { key: 'addedSugars', label: 'Added sugars', defaultUnit: 'g', category: 'label' },
  sodium: { key: 'sodium', label: 'Sodium', defaultUnit: 'mg', category: 'label' },
  salt: { key: 'salt', label: 'Salt', defaultUnit: 'g', category: 'label' },
  saturates: { key: 'saturates', label: 'Saturates', defaultUnit: 'g', category: 'label' },
  cholesterol: { key: 'cholesterol', label: 'Cholesterol', defaultUnit: 'mg', category: 'label' },
  potassium: { key: 'potassium', label: 'Potassium', defaultUnit: 'mg', category: 'label' },
  calcium: { key: 'calcium', label: 'Calcium', defaultUnit: 'mg', category: 'label' },
  magnesium: { key: 'magnesium', label: 'Magnesium', defaultUnit: 'mg', category: 'label' },
  iron: { key: 'iron', label: 'Iron', defaultUnit: 'mg', category: 'label' },
  vitaminC: { key: 'vitaminC', label: 'Vitamin C', defaultUnit: 'mg', category: 'label' },
  vitaminD: { key: 'vitaminD', label: 'Vitamin D', defaultUnit: 'mcg', category: 'label' },
  vitaminB12: { key: 'vitaminB12', label: 'Vitamin B12', defaultUnit: 'mcg', category: 'label' },
  caffeine: { key: 'caffeine', label: 'Caffeine', defaultUnit: 'mg', category: 'label' },
  monounsaturatedFat: {
    key: 'monounsaturatedFat',
    label: 'Monounsaturated fat',
    defaultUnit: 'g',
    category: 'label',
  },
  polyunsaturatedFat: {
    key: 'polyunsaturatedFat',
    label: 'Polyunsaturated fat',
    defaultUnit: 'g',
    category: 'label',
  },
  transFat: { key: 'transFat', label: 'Trans fat', defaultUnit: 'g', category: 'label' },
  omega3: { key: 'omega3', label: 'Omega-3', defaultUnit: 'g', category: 'label' },
  omega6: { key: 'omega6', label: 'Omega-6', defaultUnit: 'g', category: 'label' },
  folate: { key: 'folate', label: 'Folate', defaultUnit: 'mcg', category: 'label' },
  vitaminA: { key: 'vitaminA', label: 'Vitamin A', defaultUnit: 'mcg', category: 'label' },
  vitaminE: { key: 'vitaminE', label: 'Vitamin E', defaultUnit: 'mg', category: 'label' },
  vitaminK: { key: 'vitaminK', label: 'Vitamin K', defaultUnit: 'mcg', category: 'label' },
  thiamin: { key: 'thiamin', label: 'Thiamin', defaultUnit: 'mg', category: 'label' },
  riboflavin: { key: 'riboflavin', label: 'Riboflavin', defaultUnit: 'mg', category: 'label' },
  niacin: { key: 'niacin', label: 'Niacin', defaultUnit: 'mg', category: 'label' },
  vitaminB6: { key: 'vitaminB6', label: 'Vitamin B6', defaultUnit: 'mg', category: 'label' },
  biotin: { key: 'biotin', label: 'Biotin', defaultUnit: 'mcg', category: 'label' },
  pantothenicAcid: {
    key: 'pantothenicAcid',
    label: 'Pantothenic acid',
    defaultUnit: 'mg',
    category: 'label',
  },
  phosphorus: { key: 'phosphorus', label: 'Phosphorus', defaultUnit: 'mg', category: 'label' },
  zinc: { key: 'zinc', label: 'Zinc', defaultUnit: 'mg', category: 'label' },
  selenium: { key: 'selenium', label: 'Selenium', defaultUnit: 'mcg', category: 'label' },
  copper: { key: 'copper', label: 'Copper', defaultUnit: 'mg', category: 'label' },
  manganese: { key: 'manganese', label: 'Manganese', defaultUnit: 'mg', category: 'label' },
  iodine: { key: 'iodine', label: 'Iodine', defaultUnit: 'mcg', category: 'label' },
  chromium: { key: 'chromium', label: 'Chromium', defaultUnit: 'mcg', category: 'label' },
  molybdenum: { key: 'molybdenum', label: 'Molybdenum', defaultUnit: 'mcg', category: 'label' },
  choline: { key: 'choline', label: 'Choline', defaultUnit: 'mg', category: 'label' },
  chloride: { key: 'chloride', label: 'Chloride', defaultUnit: 'mg', category: 'label' },
  fluoride: { key: 'fluoride', label: 'Fluoride', defaultUnit: 'mg', category: 'label' },
  boron: { key: 'boron', label: 'Boron', defaultUnit: 'mg', category: 'label' },
  betaCarotene: { key: 'betaCarotene', label: 'Beta-carotene', defaultUnit: 'mcg', category: 'label' },
  lutein: { key: 'lutein', label: 'Lutein', defaultUnit: 'mg', category: 'label' },
  lycopene: { key: 'lycopene', label: 'Lycopene', defaultUnit: 'mg', category: 'label' },
  alcohol: { key: 'alcohol', label: 'Alcohol', defaultUnit: 'g', category: 'label' },
}

export const SUPPORTED_NUTRIENT_KEYS_V1 = Object.keys(
  NUTRIENT_DEFINITIONS_V1,
) as CanonicalNutrientKeyV1[]

export const NUTRIENT_DEFINITION_LIST_V1 = SUPPORTED_NUTRIENT_KEYS_V1.map(
  (key) => NUTRIENT_DEFINITIONS_V1[key],
)

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
  magnesium: 'magnesium',
  iron: 'iron',
  vitaminc: 'vitaminC',
  vitamind: 'vitaminD',
  vitaminb12: 'vitaminB12',
  b12: 'vitaminB12',
  caffeine: 'caffeine',
  monounsaturatedfat: 'monounsaturatedFat',
  monofat: 'monounsaturatedFat',
  polyunsaturatedfat: 'polyunsaturatedFat',
  polyfat: 'polyunsaturatedFat',
  transfat: 'transFat',
  omega3: 'omega3',
  omega6: 'omega6',
  folate: 'folate',
  vitamina: 'vitaminA',
  vitamine: 'vitaminE',
  vitamink: 'vitaminK',
  thiamin: 'thiamin',
  thiamine: 'thiamin',
  riboflavin: 'riboflavin',
  niacin: 'niacin',
  vitaminb6: 'vitaminB6',
  biotin: 'biotin',
  pantothenicacid: 'pantothenicAcid',
  phosphorus: 'phosphorus',
  zinc: 'zinc',
  selenium: 'selenium',
  copper: 'copper',
  manganese: 'manganese',
  iodine: 'iodine',
  chromium: 'chromium',
  molybdenum: 'molybdenum',
  choline: 'choline',
  chloride: 'chloride',
  fluoride: 'fluoride',
  boron: 'boron',
  betacarotene: 'betaCarotene',
  lutein: 'lutein',
  lycopene: 'lycopene',
  alcohol: 'alcohol',
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
