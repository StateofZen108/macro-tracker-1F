import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CatalogFoodRecord, RemoteCatalogHit } from './types.js'

export const FOOD_CATALOG_CACHE_DB_NAME = 'macrotracker-food-catalog'
const FOOD_CATALOG_CACHE_DB_VERSION = 1
const CATALOG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CATALOG_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

interface FoodCatalogCacheDatabase extends DBSchema {
  catalogFoods: {
    key: string
    value: CatalogFoodRecord
  }
}

let dbPromise: Promise<IDBPDatabase<FoodCatalogCacheDatabase>> | null = null

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function isoFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

async function getDatabase(): Promise<IDBPDatabase<FoodCatalogCacheDatabase> | null> {
  if (!canUseIndexedDb()) {
    return null
  }

  if (!dbPromise) {
    dbPromise = openDB<FoodCatalogCacheDatabase>(
      FOOD_CATALOG_CACHE_DB_NAME,
      FOOD_CATALOG_CACHE_DB_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains('catalogFoods')) {
            database.createObjectStore('catalogFoods')
          }
        },
      },
    )
  }

  return dbPromise
}

function buildSearchText(record: Pick<CatalogFoodRecord, 'name' | 'brand' | 'barcode'>): string {
  return `${record.name} ${record.brand ?? ''} ${record.barcode ?? ''}`.trim().toLowerCase()
}

export function buildCatalogFoodRecord(
  hit: RemoteCatalogHit,
  now = new Date().toISOString(),
): CatalogFoodRecord {
  const cachedAt = new Date(now).getTime()

  return {
    id: `${hit.provider}:${hit.remoteKey}`,
    remoteKey: hit.remoteKey,
    provider: hit.provider,
    name: hit.name,
    brand: hit.brand,
    barcode: hit.barcode,
    servingSize: hit.servingSize,
    servingUnit: hit.servingUnit,
    calories: hit.calories,
    protein: hit.protein,
    carbs: hit.carbs,
    fat: hit.fat,
    fiber: hit.fiber,
    imageUrl: hit.imageUrl,
    cachedAt: now,
    staleAt: isoFromTimestamp(cachedAt + CATALOG_CACHE_TTL_MS),
    lastSeenAt: now,
  }
}

export function isCatalogFoodStale(
  record: Pick<CatalogFoodRecord, 'staleAt'>,
  now = new Date().toISOString(),
): boolean {
  return Date.parse(record.staleAt) <= Date.parse(now)
}

export async function saveCatalogHitsToCache(
  hits: RemoteCatalogHit[],
  now = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase()
  if (!db || !hits.length) {
    return
  }

  const transaction = db.transaction('catalogFoods', 'readwrite')
  for (const hit of hits) {
    const recordId = `${hit.provider}:${hit.remoteKey}`
    const existing = await transaction.store.get(recordId)
    const record = buildCatalogFoodRecord(hit, now)
    await transaction.store.put(
      existing
        ? {
            ...existing,
            ...record,
            cachedAt: existing.cachedAt,
            staleAt: isoFromTimestamp(Date.parse(now) + CATALOG_CACHE_TTL_MS),
          }
        : record,
      record.id,
    )
  }

  await transaction.done
}

export async function listCatalogCache(): Promise<CatalogFoodRecord[]> {
  const db = await getDatabase()
  if (!db) {
    return []
  }

  return db.getAll('catalogFoods')
}

export async function searchCatalogCache(
  query: string,
  now = new Date().toISOString(),
): Promise<Array<CatalogFoodRecord & { stale: boolean }>> {
  const normalizedQuery = query.trim().toLowerCase()
  const cachedFoods = await listCatalogCache()
  return cachedFoods
    .filter((record) => !normalizedQuery || buildSearchText(record).includes(normalizedQuery))
    .map((record) => ({
      ...record,
      stale: isCatalogFoodStale(record, now),
    }))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
}

export async function pruneCatalogCache(now = new Date().toISOString()): Promise<void> {
  const db = await getDatabase()
  if (!db) {
    return
  }

  const cutoff = Date.parse(now) - CATALOG_CACHE_RETENTION_MS
  const transaction = db.transaction('catalogFoods', 'readwrite')
  let cursor = await transaction.store.openCursor()
  while (cursor) {
    if (Date.parse(cursor.value.cachedAt) < cutoff) {
      await cursor.delete()
    }
    cursor = await cursor.continue()
  }

  await transaction.done
}

export async function clearCatalogCacheForTests(): Promise<void> {
  if (!canUseIndexedDb()) {
    dbPromise = null
    return
  }

  if (dbPromise) {
    const db = await dbPromise
    db.close()
  }

  dbPromise = null
  await deleteDB(FOOD_CATALOG_CACHE_DB_NAME)
}
