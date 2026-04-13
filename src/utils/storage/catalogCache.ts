import type { ActionResult, CatalogFood, RemoteCatalogHit } from '../../types'
import { createExtraCollectionStore } from './extraStore'

const STORAGE_KEY = 'mt_catalog_cache'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeCatalogFood(rawValue: unknown): CatalogFood | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = readString(rawValue.id)
  const remoteKey = readString(rawValue.remoteKey)
  const name = readString(rawValue.name)
  const cachedAt = readString(rawValue.cachedAt)
  const staleAt = readString(rawValue.staleAt)
  const updatedAt = readString(rawValue.updatedAt)
  if (!id || !remoteKey || !name || !cachedAt || !staleAt || !updatedAt) {
    return null
  }

  return {
    id,
    remoteKey,
    provider: rawValue.provider === 'open_food_facts' ? 'open_food_facts' : 'open_food_facts',
    name,
    brand: readString(rawValue.brand),
    servingSize: readNumber(rawValue.servingSize),
    servingUnit: readString(rawValue.servingUnit),
    calories: readNumber(rawValue.calories),
    protein: readNumber(rawValue.protein),
    carbs: readNumber(rawValue.carbs),
    fat: readNumber(rawValue.fat),
    fiber: readNumber(rawValue.fiber),
    barcode: readString(rawValue.barcode),
    imageUrl: readString(rawValue.imageUrl),
    importConfidence:
      rawValue.importConfidence === 'direct_match' ||
      rawValue.importConfidence === 'weak_match' ||
      rawValue.importConfidence === 'manual_review_required'
        ? rawValue.importConfidence
        : undefined,
    sourceQuality:
      rawValue.sourceQuality === 'high' ||
      rawValue.sourceQuality === 'medium' ||
      rawValue.sourceQuality === 'low'
        ? rawValue.sourceQuality
        : undefined,
    sourceQualityNote: readString(rawValue.sourceQualityNote),
    nutrients: isRecord(rawValue.nutrients)
      ? (rawValue.nutrients as unknown as CatalogFood['nutrients'])
      : undefined,
    cachedAt,
    staleAt,
    lastUsedAt: readString(rawValue.lastUsedAt),
    updatedAt,
  }
}

const store = createExtraCollectionStore<CatalogFood>({
  key: STORAGE_KEY,
  parse: (value) =>
    Array.isArray(value)
      ? value
          .map((item) => normalizeCatalogFood(item))
          .filter((item): item is CatalogFood => item !== null)
      : [],
  sort: (items) => [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
})

export function loadCatalogCache(): CatalogFood[] {
  return store.load()
}

export function saveCatalogCache(items: CatalogFood[]): ActionResult<void> {
  return store.save(items)
}

export function subscribeToCatalogCache(listener: () => void): () => void {
  return store.subscribe(listener)
}

export function upsertRemoteCatalogHits(hits: RemoteCatalogHit[]): ActionResult<void> {
  const now = new Date().toISOString()
  const staleAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  const currentItems = new Map(loadCatalogCache().map((item) => [item.remoteKey, item]))
  for (const hit of hits) {
    currentItems.set(hit.remoteKey, {
      id: `catalog-${hit.remoteKey}`,
      remoteKey: hit.remoteKey,
      provider: hit.provider,
      name: hit.name,
      brand: hit.brand,
      servingSize: hit.servingSize,
      servingUnit: hit.servingUnit,
      calories: hit.calories,
      protein: hit.protein,
      carbs: hit.carbs,
      fat: hit.fat,
      fiber: hit.fiber,
      barcode: hit.barcode,
      imageUrl: hit.imageUrl,
      importConfidence: hit.importConfidence,
      sourceQuality: hit.sourceQuality,
      sourceQualityNote: hit.sourceQualityNote,
      cachedAt: now,
      staleAt,
      updatedAt: now,
    })
  }

  return saveCatalogCache([...currentItems.values()])
}
