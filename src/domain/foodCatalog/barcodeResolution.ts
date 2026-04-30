import type {
  ActionResult,
  BarcodeLookupResult,
  CatalogProvider,
  Food,
  ImportTrustLevel,
} from '../../types.js'

export interface BarcodeLookupResolution {
  source: 'local_barcode' | 'local_remote_reference' | 'remote'
  food?: Food
  lookupResult?: BarcodeLookupResult
}

interface ResolveBarcodeLookupInput {
  barcode: string
  foods: Food[]
  lookupRemote: (barcode: string) => Promise<ActionResult<BarcodeLookupResult>>
}

const IMPORT_TRUST_RANK: Record<ImportTrustLevel, number> = {
  exact_autolog: 3,
  exact_review: 2,
  blocked: 1,
}

const PROVIDER_RANK: Record<CatalogProvider, number> = {
  fatsecret: 3,
  open_food_facts: 2,
  usda_fdc: 1,
}

function normalizeBarcode(value: string | undefined): string {
  return value?.replace(/\D/g, '') ?? ''
}

function getTrustRank(food: Food): number {
  const level = food.importTrust?.level
  return level ? IMPORT_TRUST_RANK[level] : 0
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareDescending(left: number, right: number): number {
  return right - left
}

function compareOptionalTimestamp(left: string | undefined, right: string | undefined): number {
  const leftTimestamp = parseTimestamp(left)
  const rightTimestamp = parseTimestamp(right)
  if (leftTimestamp === null && rightTimestamp === null) {
    return 0
  }
  if (leftTimestamp === null) {
    return 1
  }
  if (rightTimestamp === null) {
    return -1
  }
  return compareDescending(leftTimestamp, rightTimestamp)
}

function compareFoodTieBreakers(left: Food, right: Food): number {
  const trustDelta = compareDescending(getTrustRank(left), getTrustRank(right))
  if (trustDelta !== 0) {
    return trustDelta
  }

  const verifiedDelta = compareOptionalTimestamp(
    left.importTrust?.verifiedAt,
    right.importTrust?.verifiedAt,
  )
  if (verifiedDelta !== 0) {
    return verifiedDelta
  }

  const lastUsedDelta = compareOptionalTimestamp(left.lastUsedAt, right.lastUsedAt)
  if (lastUsedDelta !== 0) {
    return lastUsedDelta
  }

  const usageDelta = compareDescending(left.usageCount, right.usageCount)
  if (usageDelta !== 0) {
    return usageDelta
  }

  const updatedDelta = compareOptionalTimestamp(
    left.updatedAt ?? left.createdAt,
    right.updatedAt ?? right.createdAt,
  )
  if (updatedDelta !== 0) {
    return updatedDelta
  }

  return left.id.localeCompare(right.id)
}

function getBestMatchedRemoteReferenceProviderRank(food: Food, normalizedBarcode: string): number {
  let bestRank = 0
  for (const reference of food.remoteReferences ?? []) {
    if (normalizeBarcode(reference.barcode) !== normalizedBarcode) {
      continue
    }
    bestRank = Math.max(bestRank, PROVIDER_RANK[reference.provider] ?? 0)
  }
  return bestRank
}

function pickLocalBarcodeWinner(foods: Food[], normalizedBarcode: string): Food | null {
  const matches = foods.filter(
    (food) => !food.archivedAt && normalizeBarcode(food.barcode) === normalizedBarcode,
  )
  if (!matches.length) {
    return null
  }

  return [...matches].sort(compareFoodTieBreakers)[0] ?? null
}

function pickLocalRemoteReferenceWinner(foods: Food[], normalizedBarcode: string): Food | null {
  const matches = foods.filter(
    (food) => !food.archivedAt && getBestMatchedRemoteReferenceProviderRank(food, normalizedBarcode) > 0,
  )
  if (!matches.length) {
    return null
  }

  return (
    [...matches].sort((left, right) => {
      const providerDelta = compareDescending(
        getBestMatchedRemoteReferenceProviderRank(left, normalizedBarcode),
        getBestMatchedRemoteReferenceProviderRank(right, normalizedBarcode),
      )
      if (providerDelta !== 0) {
        return providerDelta
      }

      return compareFoodTieBreakers(left, right)
    })[0] ?? null
  )
}

export async function resolveBarcodeLookup(
  input: ResolveBarcodeLookupInput,
): Promise<ActionResult<BarcodeLookupResolution>> {
  const normalizedBarcode = normalizeBarcode(input.barcode)
  const localBarcodeMatch = pickLocalBarcodeWinner(input.foods, normalizedBarcode)
  if (localBarcodeMatch) {
    return {
      ok: true,
      data: {
        source: 'local_barcode',
        food: localBarcodeMatch,
      },
    }
  }

  const localRemoteReferenceMatch = pickLocalRemoteReferenceWinner(input.foods, normalizedBarcode)
  if (localRemoteReferenceMatch) {
    return {
      ok: true,
      data: {
        source: 'local_remote_reference',
        food: localRemoteReferenceMatch,
      },
    }
  }

  const remoteResult = await input.lookupRemote(normalizedBarcode)
  if (!remoteResult.ok) {
    return remoteResult
  }

  return {
    ok: true,
    data: {
      source: 'remote',
      lookupResult: remoteResult.data,
    },
  }
}
