import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Food, FoodLogEntry, MealTemplate, UserSettings, WeightEntry } from '../../types'

export const STORAGE_IDB_NAME = 'macrotracker-storage'
const STORAGE_IDB_VERSION = 1

type CoreDomain = 'foods' | 'settings' | 'weights' | 'mealTemplates' | 'logsByDate'

export interface IndexedDbMigrationState {
  migratedDomains: CoreDomain[]
  completedAt?: string
}

export interface IndexedDbCoreSnapshot {
  foods: Food[]
  settings: UserSettings | null
  weights: WeightEntry[]
  mealTemplates: MealTemplate[]
  logsByDate: Record<string, FoodLogEntry[]>
}

export interface StorageDiagnosticEvent {
  id: string
  eventType:
    | 'sync_push_failed'
    | 'sync_dead_letter_created'
    | 'sync_bootstrap_failed'
    | 'ocr_extract_failed'
    | 'storage_migration_failed'
    | 'storage_recovery_triggered'
    | 'food_identity_conflict'
  createdAt: string
  severity: 'info' | 'warning' | 'error'
  scope: 'sync' | 'storage' | 'ocr' | 'foods'
  recordKey?: string
  payload: Record<string, unknown>
}

interface StorageDatabase extends DBSchema {
  meta: {
    key: string
    value: IndexedDbMigrationState
  }
  foods: {
    key: 'default'
    value: Food[]
  }
  settings: {
    key: 'default'
    value: UserSettings
  }
  weights: {
    key: 'default'
    value: WeightEntry[]
  }
  mealTemplates: {
    key: 'default'
    value: MealTemplate[]
  }
  logs: {
    key: string
    value: FoodLogEntry[]
  }
  diagnostics: {
    key: string
    value: StorageDiagnosticEvent
  }
}

let dbPromise: Promise<IDBPDatabase<StorageDatabase>> | null = null

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

async function getDatabase(): Promise<IDBPDatabase<StorageDatabase> | null> {
  if (!canUseIndexedDb()) {
    return null
  }

  if (!dbPromise) {
    dbPromise = openDB<StorageDatabase>(STORAGE_IDB_NAME, STORAGE_IDB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta')
        }

        if (!database.objectStoreNames.contains('foods')) {
          database.createObjectStore('foods')
        }

        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings')
        }

        if (!database.objectStoreNames.contains('weights')) {
          database.createObjectStore('weights')
        }

        if (!database.objectStoreNames.contains('mealTemplates')) {
          database.createObjectStore('mealTemplates')
        }

        if (!database.objectStoreNames.contains('logs')) {
          database.createObjectStore('logs')
        }

        if (!database.objectStoreNames.contains('diagnostics')) {
          database.createObjectStore('diagnostics')
        }
      },
    })
  }

  return dbPromise
}

export async function readIndexedDbMigrationState(): Promise<IndexedDbMigrationState | null> {
  const db = await getDatabase()
  if (!db) {
    return null
  }

  return (await db.get('meta', 'migrationState')) ?? null
}

export async function writeIndexedDbMigrationState(state: IndexedDbMigrationState): Promise<void> {
  const db = await getDatabase()
  if (!db) {
    return
  }

  await db.put('meta', state, 'migrationState')
}

export async function readIndexedDbCoreSnapshot(): Promise<IndexedDbCoreSnapshot | null> {
  const db = await getDatabase()
  if (!db) {
    return null
  }

  const [foods, settings, weights, mealTemplates] = await Promise.all([
    db.get('foods', 'default'),
    db.get('settings', 'default'),
    db.get('weights', 'default'),
    db.get('mealTemplates', 'default'),
  ])

  const logsByDate: Record<string, FoodLogEntry[]> = {}
  let hasLogs = false
  let cursor = await db.transaction('logs').store.openCursor()
  while (cursor) {
    logsByDate[cursor.key] = cursor.value
    hasLogs = true
    cursor = await cursor.continue()
  }

  if (!foods && !settings && !weights && !mealTemplates && !hasLogs) {
    return null
  }

  return {
    foods: foods ?? [],
    settings: settings ?? null,
    weights: weights ?? [],
    mealTemplates: mealTemplates ?? [],
    logsByDate,
  }
}

export async function writeIndexedDbCoreSnapshot(snapshot: IndexedDbCoreSnapshot): Promise<void> {
  const db = await getDatabase()
  if (!db || !snapshot.settings) {
    return
  }

  const transaction = db.transaction(
    ['foods', 'settings', 'weights', 'mealTemplates', 'logs'],
    'readwrite',
  )

  await transaction.objectStore('foods').put(snapshot.foods, 'default')
  await transaction.objectStore('settings').put(snapshot.settings, 'default')
  await transaction.objectStore('weights').put(snapshot.weights, 'default')
  await transaction.objectStore('mealTemplates').put(snapshot.mealTemplates, 'default')

  const logStore = transaction.objectStore('logs')
  let existingCursor = await logStore.openCursor()
  while (existingCursor) {
    await existingCursor.delete()
    existingCursor = await existingCursor.continue()
  }

  for (const [date, entries] of Object.entries(snapshot.logsByDate)) {
    await logStore.put(entries, date)
  }

  await transaction.done
}

export async function appendStorageDiagnosticEvent(event: StorageDiagnosticEvent): Promise<void> {
  const db = await getDatabase()
  if (!db) {
    return
  }

  const transaction = db.transaction('diagnostics', 'readwrite')
  const diagnosticsStore = transaction.objectStore('diagnostics')
  await diagnosticsStore.put(event, event.id)

  const events = await diagnosticsStore.getAll()
  const now = Date.now()
  const retentionCutoff = now - 30 * 24 * 60 * 60 * 1000
  const sorted = [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const retained = new Set(
    sorted
      .filter((item, index) => index < 2000 && Date.parse(item.createdAt) >= retentionCutoff)
      .map((item) => item.id),
  )

  for (const item of events) {
    if (!retained.has(item.id)) {
      await diagnosticsStore.delete(item.id)
    }
  }

  await transaction.done
}

export async function listStorageDiagnosticEvents(): Promise<StorageDiagnosticEvent[]> {
  const db = await getDatabase()
  if (!db) {
    return []
  }

  const events = await db.getAll('diagnostics')
  return events.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function clearStorageIndexedDbForTests(): Promise<void> {
  if (!canUseIndexedDb()) {
    dbPromise = null
    return
  }

  const db = await getDatabase()
  if (db) {
    const storeNames = [
      'meta',
      'foods',
      'settings',
      'weights',
      'mealTemplates',
      'logs',
      'diagnostics',
    ] as const
    for (const storeName of storeNames) {
      if (db.objectStoreNames.contains(storeName)) {
        await db.clear(storeName)
      }
    }

    db.close()
  }

  dbPromise = null
}
