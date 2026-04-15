import type { CatalogProvider, Food, FoodDraft, FoodRemoteReference } from '../../types'
import { getFoodIdentityKey, normalizeFoodIdentity } from './dedupe'

export const MAX_SEARCH_ALIASES = 12

export type FoodLibraryMatch =
  | { kind: 'activeBarcodeMatch'; food: Food }
  | { kind: 'activeRemoteReferenceMatch'; food: Food }
  | { kind: 'activeIdentityMatch'; food: Food }
  | { kind: 'archivedBarcodeMatch'; food: Food }
  | { kind: 'archivedRemoteReferenceMatch'; food: Food }
  | { kind: 'archivedIdentityMatch'; food: Food }
  | { kind: 'none' }

export function buildRemoteReferenceKey(
  provider: CatalogProvider,
  remoteKey: string,
): string {
  return `${provider}:${normalizeFoodIdentity(remoteKey)}`
}

export function normalizeSearchAlias(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')

  return normalized ? normalized : null
}

export function normalizeRemoteReference(
  reference: FoodRemoteReference | null | undefined,
): FoodRemoteReference | null {
  if (!reference) {
    return null
  }

  const provider =
    reference.provider === 'open_food_facts' ||
    reference.provider === 'usda_fdc' ||
    reference.provider === 'fatsecret'
      ? reference.provider
      : null
  const remoteKey = reference.remoteKey?.trim()
  if (!provider || !remoteKey) {
    return null
  }

  return {
    provider,
    remoteKey,
    barcode: normalizeFoodIdentity(reference.barcode) || undefined,
  }
}

export function normalizeRemoteReferences(
  references: FoodRemoteReference[] | undefined,
): FoodRemoteReference[] | undefined {
  if (!Array.isArray(references) || references.length === 0) {
    return undefined
  }

  const byKey = new Map<string, FoodRemoteReference>()
  for (const reference of references) {
    const normalized = normalizeRemoteReference(reference)
    if (!normalized) {
      continue
    }

    const key = buildRemoteReferenceKey(normalized.provider, normalized.remoteKey)
    byKey.set(key, normalized)
  }

  return byKey.size ? [...byKey.values()] : undefined
}

export function buildSystemSearchAliases(input: {
  name: string
  brand?: string
  barcode?: string
}): string[] {
  const systemAliases = [
    input.name,
    [input.brand?.trim(), input.name.trim()].filter(Boolean).join(' '),
    input.barcode,
  ]

  const seen = new Set<string>()
  const aliases: string[] = []
  for (const alias of systemAliases) {
    const normalized = normalizeSearchAlias(alias)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    aliases.push(normalized)
  }

  return aliases
}

export function buildImportSearchAliases(input: {
  draft: Pick<FoodDraft, 'name' | 'brand' | 'barcode'>
  acceptedQuery?: string
}): string[] {
  const aliases = buildSystemSearchAliases(input.draft)
  const acceptedQueryAlias = normalizeSearchAlias(input.acceptedQuery)
  if (acceptedQueryAlias && !aliases.includes(acceptedQueryAlias)) {
    aliases.push(acceptedQueryAlias)
  }
  return aliases
}

export function mergeSearchAliases(input: {
  existing: string[] | undefined
  additions: string[]
  systemAliases: string[]
}): { aliases: string[] | undefined; trimmed: boolean } {
  const existingAliases = Array.isArray(input.existing)
    ? input.existing.map((alias) => normalizeSearchAlias(alias)).filter((alias): alias is string => Boolean(alias))
    : []
  const additions = input.additions
    .map((alias) => normalizeSearchAlias(alias))
    .filter((alias): alias is string => Boolean(alias))
  const systemAliases = input.systemAliases
    .map((alias) => normalizeSearchAlias(alias))
    .filter((alias): alias is string => Boolean(alias))

  const ordered = [...existingAliases, ...additions]
  const deduped: string[] = []
  const seen = new Set<string>()
  for (const alias of ordered) {
    if (seen.has(alias)) {
      continue
    }
    seen.add(alias)
    deduped.push(alias)
  }

  if (deduped.length <= MAX_SEARCH_ALIASES) {
    return {
      aliases: deduped.length ? deduped : undefined,
      trimmed: false,
    }
  }

  const systemSet = new Set(systemAliases)
  const keep = deduped.filter((alias) => systemSet.has(alias))
  const trimmed = deduped.filter((alias) => !systemSet.has(alias)).slice(-Math.max(0, MAX_SEARCH_ALIASES - keep.length))
  const aliases = [...keep, ...trimmed].slice(0, MAX_SEARCH_ALIASES)

  return {
    aliases: aliases.length ? aliases : undefined,
    trimmed: true,
  }
}

function foodHasRemoteReference(food: Food, draft: FoodDraft): boolean {
  const draftReferences = normalizeRemoteReferences(draft.remoteReferences)
  if (!draftReferences?.length) {
    return false
  }

  const localReferenceKeys = new Set(
    (food.remoteReferences ?? []).map((reference) =>
      buildRemoteReferenceKey(reference.provider, reference.remoteKey),
    ),
  )

  return draftReferences.some((reference) =>
    localReferenceKeys.has(buildRemoteReferenceKey(reference.provider, reference.remoteKey)),
  )
}

export function resolveFoodLibraryMatch(
  foods: Food[],
  draft: FoodDraft,
  excludeFoodId?: string,
): FoodLibraryMatch {
  const candidates = foods.filter((food) => food.id !== excludeFoodId)
  const activeFoods = candidates.filter((food) => !food.archivedAt)
  const archivedFoods = candidates.filter((food) => Boolean(food.archivedAt))
  const normalizedBarcode = normalizeFoodIdentity(draft.barcode)

  if (normalizedBarcode) {
    const activeBarcodeMatch = activeFoods.find(
      (food) => normalizeFoodIdentity(food.barcode) === normalizedBarcode,
    )
    if (activeBarcodeMatch) {
      return { kind: 'activeBarcodeMatch', food: activeBarcodeMatch }
    }
  }

  const activeRemoteReferenceMatch = activeFoods.find((food) => foodHasRemoteReference(food, draft))
  if (activeRemoteReferenceMatch) {
    return { kind: 'activeRemoteReferenceMatch', food: activeRemoteReferenceMatch }
  }

  const draftIdentityKey = getFoodIdentityKey(draft)
  const activeIdentityMatch = activeFoods.find((food) => getFoodIdentityKey(food) === draftIdentityKey)
  if (activeIdentityMatch) {
    return { kind: 'activeIdentityMatch', food: activeIdentityMatch }
  }

  if (normalizedBarcode) {
    const archivedBarcodeMatch = archivedFoods.find(
      (food) => normalizeFoodIdentity(food.barcode) === normalizedBarcode,
    )
    if (archivedBarcodeMatch) {
      return { kind: 'archivedBarcodeMatch', food: archivedBarcodeMatch }
    }
  }

  const archivedRemoteReferenceMatch = archivedFoods.find((food) => foodHasRemoteReference(food, draft))
  if (archivedRemoteReferenceMatch) {
    return { kind: 'archivedRemoteReferenceMatch', food: archivedRemoteReferenceMatch }
  }

  const archivedIdentityMatch = archivedFoods.find((food) => getFoodIdentityKey(food) === draftIdentityKey)
  if (archivedIdentityMatch) {
    return { kind: 'archivedIdentityMatch', food: archivedIdentityMatch }
  }

  return { kind: 'none' }
}

export function mergeFoodRemoteReferences(
  existing: FoodRemoteReference[] | undefined,
  additions: FoodRemoteReference[] | undefined,
): FoodRemoteReference[] | undefined {
  return normalizeRemoteReferences([...(existing ?? []), ...(additions ?? [])])
}

export function mergeImportedFood(input: {
  existingFood: Food
  draft: FoodDraft
  acceptedQuery?: string
  now?: string
}): { food: Food; aliasesTrimmed: boolean } {
  const now = input.now ?? new Date().toISOString()
  const nextRemoteReferences = mergeFoodRemoteReferences(
    input.existingFood.remoteReferences,
    input.draft.remoteReferences,
  )
  const nextSystemAliases = buildSystemSearchAliases({
    name: input.existingFood.name || input.draft.name,
    brand: input.existingFood.brand ?? input.draft.brand,
    barcode: input.existingFood.barcode ?? input.draft.barcode,
  })
  const aliasMerge = mergeSearchAliases({
    existing: input.existingFood.searchAliases,
    additions: buildImportSearchAliases({
      draft: input.draft,
      acceptedQuery: input.acceptedQuery,
    }),
    systemAliases: nextSystemAliases,
  })
  const directMatch = input.draft.importConfidence === 'direct_match'

  return {
    aliasesTrimmed: aliasMerge.trimmed,
    food: {
      ...input.existingFood,
      brand: input.existingFood.brand ?? (input.draft.brand?.trim() || undefined),
      barcode: input.existingFood.barcode ?? (input.draft.barcode?.trim() || undefined),
      provider: input.existingFood.provider ?? input.draft.provider,
      importConfidence: input.draft.importConfidence ?? input.existingFood.importConfidence,
      sourceQuality: input.draft.sourceQuality ?? input.existingFood.sourceQuality,
      sourceQualityNote: input.draft.sourceQualityNote ?? input.existingFood.sourceQualityNote,
      importTrust: input.draft.importTrust ?? input.existingFood.importTrust,
      fiber:
        input.existingFood.fiber ??
        (directMatch ? input.draft.fiber : undefined) ??
        input.existingFood.fiber,
      sugars:
        input.existingFood.sugars ??
        (directMatch ? input.draft.sugars : undefined) ??
        input.existingFood.sugars,
      salt:
        input.existingFood.salt ??
        (directMatch ? input.draft.salt : undefined) ??
        input.existingFood.salt,
      sodium:
        input.existingFood.sodium ??
        (directMatch ? input.draft.sodium : undefined) ??
        input.existingFood.sodium,
      searchAliases: aliasMerge.aliases,
      remoteReferences: nextRemoteReferences,
      updatedAt: now,
    },
  }
}

export function buildImportedFoodDraft(input: {
  draft: FoodDraft
  acceptedQuery?: string
}): FoodDraft {
  const systemAliases = buildImportSearchAliases({
    draft: input.draft,
    acceptedQuery: input.acceptedQuery,
  })

  return {
    ...input.draft,
    searchAliases: mergeSearchAliases({
      existing: input.draft.searchAliases,
      additions: systemAliases,
      systemAliases: buildSystemSearchAliases(input.draft),
    }).aliases,
    remoteReferences: normalizeRemoteReferences(input.draft.remoteReferences),
  }
}
