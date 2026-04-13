import type { DiagnosticsEvent, SyncDeadLetterItem, SyncMutation, SyncState } from '../../types'

const APP_DB_NAME = 'macrotracker-app'
const APP_DB_VERSION = 1

const STORE_NAMES = {
  syncMeta: 'sync_meta',
  diagnostics: 'diagnostics_events',
} as const

type SyncMetaKey = 'deviceId' | 'state' | 'queue' | 'deadLetters'

interface SyncMetaRecord {
  key: SyncMetaKey
  value: string | SyncState | SyncMutation[] | SyncDeadLetterItem[] | null
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return null
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAMES.syncMeta)) {
          db.createObjectStore(STORE_NAMES.syncMeta, { keyPath: 'key' })
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.diagnostics)) {
          const diagnosticsStore = db.createObjectStore(STORE_NAMES.diagnostics, { keyPath: 'id' })
          diagnosticsStore.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'))
      request.onblocked = () => reject(new Error('IndexedDB open was blocked by another tab.'))
    }).catch(() => null)
  }

  return dbPromise
}

async function readSyncMeta<T>(key: SyncMetaKey): Promise<T | null> {
  const db = await openDb()
  if (!db) {
    return null
  }

  const transaction = db.transaction(STORE_NAMES.syncMeta, 'readonly')
  const store = transaction.objectStore(STORE_NAMES.syncMeta)
  const record = await requestToPromise<SyncMetaRecord | undefined>(store.get(key))
  return (record?.value as T | undefined) ?? null
}

export interface PersistedSyncSnapshot {
  deviceId: string | null
  state: SyncState | null
  queue: SyncMutation[]
  deadLetters: SyncDeadLetterItem[]
}

export async function loadPersistedSyncSnapshot(): Promise<PersistedSyncSnapshot | null> {
  const db = await openDb()
  if (!db) {
    return null
  }

  const [deviceId, state, queue, deadLetters] = await Promise.all([
    readSyncMeta<string>('deviceId'),
    readSyncMeta<SyncState>('state'),
    readSyncMeta<SyncMutation[]>('queue'),
    readSyncMeta<SyncDeadLetterItem[]>('deadLetters'),
  ])

  return {
    deviceId,
    state,
    queue: queue ?? [],
    deadLetters: deadLetters ?? [],
  }
}

export async function persistSyncSnapshot(snapshot: PersistedSyncSnapshot): Promise<boolean> {
  const db = await openDb()
  if (!db) {
    return false
  }

  const transaction = db.transaction(STORE_NAMES.syncMeta, 'readwrite')
  const store = transaction.objectStore(STORE_NAMES.syncMeta)
  const records: SyncMetaRecord[] = [
    { key: 'deviceId', value: snapshot.deviceId ?? '' },
    { key: 'state', value: snapshot.state },
    { key: 'queue', value: snapshot.queue },
    { key: 'deadLetters', value: snapshot.deadLetters },
  ]

  for (const record of records) {
    store.put(record)
  }

  await transactionDone(transaction)
  return true
}

export async function loadDiagnosticsEvents(): Promise<DiagnosticsEvent[]> {
  const db = await openDb()
  if (!db) {
    return []
  }

  const transaction = db.transaction(STORE_NAMES.diagnostics, 'readonly')
  const store = transaction.objectStore(STORE_NAMES.diagnostics)
  const events = await requestToPromise<DiagnosticsEvent[]>(store.getAll())
  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function appendDiagnosticsEvent(event: DiagnosticsEvent): Promise<boolean> {
  const db = await openDb()
  if (!db) {
    return false
  }

  const transaction = db.transaction(STORE_NAMES.diagnostics, 'readwrite')
  const store = transaction.objectStore(STORE_NAMES.diagnostics)
  store.put(event)
  await transactionDone(transaction)
  await trimDiagnosticsEvents(db)
  return true
}

export async function clearPersistedDiagnosticsEvents(): Promise<boolean> {
  const db = await openDb()
  if (!db) {
    return false
  }

  const transaction = db.transaction(STORE_NAMES.diagnostics, 'readwrite')
  transaction.objectStore(STORE_NAMES.diagnostics).clear()
  await transactionDone(transaction)
  return true
}

export async function clearPersistedAppDbForTests(): Promise<void> {
  const db = await openDb()
  db?.close()
  dbPromise = null

  if (typeof indexedDB === 'undefined') {
    return
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(APP_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

async function trimDiagnosticsEvents(db: IDBDatabase): Promise<void> {
  const events = await loadDiagnosticsEvents()
  const now = Date.now()
  const keepIds = new Set(
    events
      .filter((event, index) => {
        const eventAgeMs = now - Date.parse(event.createdAt)
        return index < 2000 && eventAgeMs <= 30 * 24 * 60 * 60 * 1000
      })
      .map((event) => event.id),
  )

  const staleEvents = events.filter((event) => !keepIds.has(event.id))
  if (!staleEvents.length) {
    return
  }

  const transaction = db.transaction(STORE_NAMES.diagnostics, 'readwrite')
  const store = transaction.objectStore(STORE_NAMES.diagnostics)
  for (const event of staleEvents) {
    store.delete(event.id)
  }
  await transactionDone(transaction)
}
