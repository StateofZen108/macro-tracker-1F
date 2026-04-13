export {
  canonicalizeNutrientKeyV1,
  getDefaultNutrientUnitV1,
  isCanonicalNutrientKeyV1,
  NUTRIENT_DEFINITIONS_V1,
} from './canonical'

export {
  buildNutrientProfileFromLabelFields,
  buildNutrientProfileFromLegacyNutrition,
  createNutrientAmountV1,
  emptyNutrientProfileV1,
  getNutrientAmountV1,
  scaleNutrientProfileV1,
  setNutrientAmountV1,
  sumNutrientProfilesV1,
} from './profile'

export type {
  CanonicalNutrientKeyV1,
  LegacyNutritionSourceV1,
  NutrientAmountV1,
  NutrientCategoryV1,
  NutrientDefinitionV1,
  NutrientProfileV1,
  NutrientUnitV1,
} from './types'
