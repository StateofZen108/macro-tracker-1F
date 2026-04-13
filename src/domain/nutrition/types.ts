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
  iron?: number
  vitaminD?: number
  caffeine?: number
}
