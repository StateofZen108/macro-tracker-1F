import type { LabelNutritionField } from '../../types'
import { canonicalizeNutrientKeyV1, getDefaultNutrientUnitV1 } from './canonical'
import type {
  CanonicalNutrientKeyV1,
  LegacyNutritionSourceV1,
  NutrientAmountV1,
  NutrientBasisV1,
  NutrientProfileV1,
  NutrientUnitV1,
} from './types'

export function createNutrientAmountV1(
  key: CanonicalNutrientKeyV1,
  value: number,
  unit: NutrientUnitV1 = getDefaultNutrientUnitV1(key),
): NutrientAmountV1 {
  return {
    key,
    value,
    unit,
  }
}

export function emptyNutrientProfileV1(
  basis: NutrientBasisV1 = 'serving',
): NutrientProfileV1 {
  return {
    basis,
    values: {},
  }
}

export function getNutrientAmountV1(
  profile: NutrientProfileV1,
  key: CanonicalNutrientKeyV1,
): number | null {
  return profile.values[key]?.value ?? null
}

export function setNutrientAmountV1(
  profile: NutrientProfileV1,
  key: CanonicalNutrientKeyV1,
  value: number,
  unit: NutrientUnitV1 = getDefaultNutrientUnitV1(key),
): NutrientProfileV1 {
  if (!Number.isFinite(value)) {
    return profile
  }

  return {
    ...profile,
    basis: profile.basis ?? 'serving',
    values: {
      ...profile.values,
      [key]: createNutrientAmountV1(key, value, unit),
    },
  }
}

export function scaleNutrientProfileV1(
  profile: NutrientProfileV1,
  multiplier: number,
): NutrientProfileV1 {
  if (!Number.isFinite(multiplier)) {
    return emptyNutrientProfileV1()
  }

  return Object.values(profile.values).reduce<NutrientProfileV1>((nextProfile, nutrient) => {
    if (!nutrient) {
      return nextProfile
    }

    return setNutrientAmountV1(
      nextProfile,
      nutrient.key,
      nutrient.value * multiplier,
      nutrient.unit,
    )
  }, emptyNutrientProfileV1(profile.basis))
}

export function sumNutrientProfilesV1(
  profiles: ReadonlyArray<NutrientProfileV1>,
): NutrientProfileV1 {
  const basis = profiles[0]?.basis ?? 'serving'
  return profiles.reduce<NutrientProfileV1>((nextProfile, profile) => {
    return Object.values(profile.values).reduce<NutrientProfileV1>((mergedProfile, nutrient) => {
      if (!nutrient) {
        return mergedProfile
      }

      const currentAmount = mergedProfile.values[nutrient.key]?.value ?? 0
      return setNutrientAmountV1(
        mergedProfile,
        nutrient.key,
        currentAmount + nutrient.value,
        nutrient.unit,
      )
    }, nextProfile)
  }, emptyNutrientProfileV1(basis))
}

export function buildNutrientProfileFromLegacyNutrition(
  source: LegacyNutritionSourceV1,
  multiplier = 1,
): NutrientProfileV1 {
  const baseProfile = emptyNutrientProfileV1('serving')
  const entries: Array<[CanonicalNutrientKeyV1, number | undefined]> = [
    ['calories', source.calories],
    ['protein', source.protein],
    ['carbs', source.carbs],
    ['fat', source.fat],
    ['fiber', source.fiber],
    ['sugars', source.sugars],
    ['addedSugars', source.addedSugars],
    ['salt', source.salt],
    ['sodium', source.sodium],
    ['saturates', source.saturates],
    ['cholesterol', source.cholesterol],
    ['potassium', source.potassium],
    ['calcium', source.calcium],
    ['magnesium', source.magnesium],
    ['iron', source.iron],
    ['vitaminC', source.vitaminC],
    ['vitaminD', source.vitaminD],
    ['vitaminB12', source.vitaminB12],
    ['caffeine', source.caffeine],
    ['monounsaturatedFat', source.monounsaturatedFat],
    ['polyunsaturatedFat', source.polyunsaturatedFat],
    ['transFat', source.transFat],
    ['omega3', source.omega3],
    ['omega6', source.omega6],
    ['folate', source.folate],
    ['vitaminA', source.vitaminA],
    ['vitaminE', source.vitaminE],
    ['vitaminK', source.vitaminK],
    ['thiamin', source.thiamin],
    ['riboflavin', source.riboflavin],
    ['niacin', source.niacin],
    ['vitaminB6', source.vitaminB6],
    ['biotin', source.biotin],
    ['pantothenicAcid', source.pantothenicAcid],
    ['phosphorus', source.phosphorus],
    ['zinc', source.zinc],
    ['selenium', source.selenium],
    ['copper', source.copper],
    ['manganese', source.manganese],
    ['iodine', source.iodine],
    ['chromium', source.chromium],
    ['molybdenum', source.molybdenum],
    ['choline', source.choline],
    ['chloride', source.chloride],
    ['fluoride', source.fluoride],
    ['boron', source.boron],
    ['betaCarotene', source.betaCarotene],
    ['lutein', source.lutein],
    ['lycopene', source.lycopene],
    ['alcohol', source.alcohol],
  ]

  return entries.reduce((nextProfile, [key, amount]) => {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return nextProfile
    }

    return setNutrientAmountV1(nextProfile, key, amount * multiplier)
  }, baseProfile)
}

export function buildNutrientProfileFromLabelFields(
  fields: ReadonlyArray<Pick<LabelNutritionField, 'normalizedKey' | 'rawLabel' | 'value' | 'unit'>>,
): NutrientProfileV1 {
  return fields.reduce<NutrientProfileV1>((nextProfile, field) => {
    if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
      return nextProfile
    }

    const key = canonicalizeNutrientKeyV1(field.normalizedKey ?? field.rawLabel)
    if (!key) {
      return nextProfile
    }

    const unit = getDefaultNutrientUnitV1(key)
    return setNutrientAmountV1(nextProfile, key, field.value, unit)
  }, emptyNutrientProfileV1('serving'))
}
