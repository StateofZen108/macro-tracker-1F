import { getFoodIdentityKey, normalizeFoodIdentity } from '../foods/dedupe'
import type { Food } from '../../types'
import type {
  CatalogFoodRecord,
  FoodIdentityInput,
  FoodIdentityMatch,
} from './types'

interface ResolveFoodIdentityOptions {
  localFoods: Food[]
  cachedCatalogFoods?: CatalogFoodRecord[]
  input: FoodIdentityInput
  excludeFoodId?: string
}

function isActiveFood(food: Food, excludeFoodId?: string): boolean {
  return !food.archivedAt && food.id !== excludeFoodId
}

function buildIdentitySearchKey(input: FoodIdentityInput): string | null {
  if (input.draft) {
    return getFoodIdentityKey(input.draft)
  }

  if (input.remoteHit) {
    return getFoodIdentityKey({
      name: input.remoteHit.name,
      brand: input.remoteHit.brand,
      servingSize: input.remoteHit.servingSize ?? 1,
      servingUnit: input.remoteHit.servingUnit ?? 'serving',
    })
  }

  return null
}

function getNormalizedBarcode(input: FoodIdentityInput): string {
  return normalizeFoodIdentity(input.draft?.barcode ?? input.remoteHit?.barcode)
}

export function resolveFoodIdentityMatch({
  localFoods,
  cachedCatalogFoods = [],
  input,
  excludeFoodId,
}: ResolveFoodIdentityOptions): FoodIdentityMatch {
  const activeFoods = localFoods.filter((food) => isActiveFood(food, excludeFoodId))
  const normalizedBarcode = getNormalizedBarcode(input)
  if (normalizedBarcode) {
    const barcodeMatch = activeFoods.find(
      (food) => normalizeFoodIdentity(food.barcode) === normalizedBarcode,
    )
    if (barcodeMatch) {
      return {
        kind: 'localBarcodeMatch',
        food: barcodeMatch,
      }
    }
  }

  if (input.remoteHit?.remoteKey) {
    const cachedMatch = cachedCatalogFoods.find(
      (catalogFood) => catalogFood.remoteKey === input.remoteHit?.remoteKey,
    )
    if (cachedMatch) {
      return {
        kind: 'catalogRemoteKeyMatch',
        catalogFood: cachedMatch,
      }
    }
  }

  const identityKey = buildIdentitySearchKey(input)
  if (identityKey) {
    const identityMatch = activeFoods.find((food) => getFoodIdentityKey(food) === identityKey)
    if (identityMatch) {
      return {
        kind: 'localIdentityMatch',
        food: identityMatch,
      }
    }
  }

  return {
    kind: 'none',
  }
}
