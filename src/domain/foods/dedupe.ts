import type { Food, FoodDraft } from '../../types.js'

export function normalizeFoodIdentity(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function getFoodIdentityKey(
  food: Pick<FoodDraft, 'name' | 'servingSize' | 'servingUnit'> & { brand?: string },
): string {
  return [
    normalizeFoodIdentity(food.name),
    normalizeFoodIdentity(food.brand),
    `${food.servingSize}`,
    normalizeFoodIdentity(food.servingUnit),
  ].join('|')
}

export function findDuplicateFoodMatch(
  foods: Food[],
  draft: FoodDraft,
  excludeFoodId?: string,
): Food | null {
  const activeFoods = foods.filter((food) => !food.archivedAt && food.id !== excludeFoodId)
  const normalizedBarcode = normalizeFoodIdentity(draft.barcode)
  if (normalizedBarcode) {
    const barcodeMatch = activeFoods.find(
      (food) => normalizeFoodIdentity(food.barcode) === normalizedBarcode,
    )
    if (barcodeMatch) {
      return barcodeMatch
    }
  }

  const draftKey = getFoodIdentityKey(draft)
  return activeFoods.find((food) => getFoodIdentityKey(food) === draftKey) ?? null
}
