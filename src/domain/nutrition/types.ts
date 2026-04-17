import type {
  CanonicalNutrientKey,
  NutrientAmountV1 as AppNutrientAmountV1,
  NutrientProfileV1 as AppNutrientProfileV1,
  NutritionBasis,
} from '../../types'

export type CanonicalNutrientKeyV1 = CanonicalNutrientKey
export type NutrientUnitV1 = AppNutrientAmountV1['unit']
export type NutrientAmountV1 = AppNutrientAmountV1
export type NutrientProfileV1 = AppNutrientProfileV1
export type NutrientBasisV1 = Exclude<NutritionBasis, 'unknown'>

export type NutrientCategoryV1 = 'macro' | 'label'

export interface NutrientDefinitionV1 {
  key: CanonicalNutrientKeyV1
  label: string
  defaultUnit: NutrientUnitV1
  category: NutrientCategoryV1
}

export interface LegacyNutritionSourceV1 {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugars?: number
  addedSugars?: number
  sodium?: number
  salt?: number
  saturates?: number
  cholesterol?: number
  potassium?: number
  calcium?: number
  magnesium?: number
  iron?: number
  vitaminC?: number
  vitaminD?: number
  vitaminB12?: number
  caffeine?: number
  monounsaturatedFat?: number
  polyunsaturatedFat?: number
  transFat?: number
  omega3?: number
  omega6?: number
  folate?: number
  vitaminA?: number
  vitaminE?: number
  vitaminK?: number
  thiamin?: number
  riboflavin?: number
  niacin?: number
  vitaminB6?: number
  biotin?: number
  pantothenicAcid?: number
  phosphorus?: number
  zinc?: number
  selenium?: number
  copper?: number
  manganese?: number
  iodine?: number
  chromium?: number
  molybdenum?: number
  choline?: number
  chloride?: number
  fluoride?: number
  boron?: number
  betaCarotene?: number
  lutein?: number
  lycopene?: number
  alcohol?: number
}
