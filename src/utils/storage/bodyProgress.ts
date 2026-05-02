import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ActionResult, BodyProgressSnapshot } from '../../types'
import { sanitizeBodyProgressSnapshot } from '../../domain/biometricSanity'

const BODY_PROGRESS_DB_NAME = 'macrotracker-body-progress'
const BODY_PROGRESS_DB_VERSION = 1
const BODY_PROGRESS_STORE = 'snapshots'

interface BodyProgressDatabase extends DBSchema {
  snapshots: {
    key: string
    value: BodyProgressSnapshot
    indexes: {
      date: string
      updatedAt: string
    }
  }
}

let dbPromise: Promise<IDBPDatabase<BodyProgressDatabase>> | null = null
let snapshotCache: BodyProgressSnapshot[] = []
const listeners = new Set<() => void>()

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

async function getDatabase(): Promise<IDBPDatabase<BodyProgressDatabase> | null> {
  if (!canUseIndexedDb()) {
    return null
  }

  if (!dbPromise) {
    dbPromise = openDB<BodyProgressDatabase>(BODY_PROGRESS_DB_NAME, BODY_PROGRESS_DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(BODY_PROGRESS_STORE)) {
          const store = database.createObjectStore(BODY_PROGRESS_STORE, { keyPath: 'id' })
          store.createIndex('date', 'date', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      },
    })
  }

  return dbPromise
}

function sortSnapshots(snapshots: BodyProgressSnapshot[]): BodyProgressSnapshot[] {
  return [...snapshots].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt),
  )
}

function sanitizeSnapshotForStorage(
  snapshot: BodyProgressSnapshot,
  existingSnapshots: readonly BodyProgressSnapshot[],
  blockInvalid = false,
): BodyProgressSnapshot {
  return sanitizeBodyProgressSnapshot(snapshot, {
    source: 'body_progress',
    existingSnapshots,
    blockInvalid,
  }).snapshot
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

export function getBodyProgressSnapshot(): BodyProgressSnapshot[] {
  return snapshotCache
}

export function subscribeBodyProgress(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function listBodyProgressSnapshots(): Promise<BodyProgressSnapshot[]> {
  const database = await getDatabase()
  if (!database) {
    snapshotCache = []
    return snapshotCache
  }

  const rawSnapshots = await database.getAll(BODY_PROGRESS_STORE)
  snapshotCache = sortSnapshots(
    rawSnapshots.map((snapshot) =>
      sanitizeBodyProgressSnapshot(snapshot, {
        source: 'storage_load',
        existingSnapshots: rawSnapshots,
      }).snapshot,
    ),
  )
  return snapshotCache
}

export async function refreshBodyProgressSnapshots(): Promise<BodyProgressSnapshot[]> {
  const snapshots = await listBodyProgressSnapshots()
  emitChange()
  return snapshots
}

export async function saveBodyProgressSnapshot(
  snapshot: BodyProgressSnapshot,
): Promise<ActionResult<BodyProgressSnapshot>> {
  const database = await getDatabase()
  if (!database) {
    return fail('unavailable', 'IndexedDB is unavailable in this environment.')
  }

  try {
    const sanitized = sanitizeSnapshotForStorage(snapshot, await listBodyProgressSnapshots(), true)
    if (sanitized.metrics.length !== snapshot.metrics.length) {
      return fail('invalidBiometric', 'One or more body metrics are outside safe biometric ranges.')
    }
    await database.put(BODY_PROGRESS_STORE, sanitized)
    await refreshBodyProgressSnapshots()
    return ok(sanitized)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist body progress locally.')
  }
}

export async function deleteBodyProgressSnapshot(snapshotId: string): Promise<ActionResult<void>> {
  const database = await getDatabase()
  if (!database) {
    return fail('unavailable', 'IndexedDB is unavailable in this environment.')
  }

  try {
    await database.delete(BODY_PROGRESS_STORE, snapshotId)
    await refreshBodyProgressSnapshots()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to delete the saved body-progress snapshot.')
  }
}

function mergeSnapshots(
  currentSnapshots: BodyProgressSnapshot[],
  importedSnapshots: BodyProgressSnapshot[],
): BodyProgressSnapshot[] {
  const merged = new Map(currentSnapshots.map((snapshot) => [snapshot.id, snapshot]))
  for (const snapshot of importedSnapshots) {
    const existing = merged.get(snapshot.id)
    if (!existing || existing.updatedAt.localeCompare(snapshot.updatedAt) <= 0) {
      merged.set(snapshot.id, snapshot)
    }
  }

  return sortSnapshots([...merged.values()])
}

export async function replaceBodyProgressSnapshots(
  snapshots: BodyProgressSnapshot[],
): Promise<ActionResult<void>> {
  const database = await getDatabase()
  if (!database) {
    return fail('unavailable', 'IndexedDB is unavailable in this environment.')
  }

  try {
    const transaction = database.transaction(BODY_PROGRESS_STORE, 'readwrite')
    await transaction.store.clear()
    const sanitizedSnapshots = snapshots.map((snapshot) =>
      sanitizeBodyProgressSnapshot(snapshot, {
        source: 'backup_restore',
        existingSnapshots: snapshots,
      }).snapshot,
    )
    for (const snapshot of sanitizedSnapshots) {
      await transaction.store.put(snapshot)
    }
    await transaction.done
    await refreshBodyProgressSnapshots()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to restore body-progress snapshots locally.')
  }
}

export async function mergeBodyProgressSnapshots(
  snapshots: BodyProgressSnapshot[],
): Promise<ActionResult<void>> {
  const nextSnapshots = mergeSnapshots(await listBodyProgressSnapshots(), snapshots)
  return replaceBodyProgressSnapshots(nextSnapshots)
}

export async function clearBodyProgressSnapshotsForTests(): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    snapshotCache = []
    dbPromise = null
    return
  }

  await database.clear(BODY_PROGRESS_STORE)
  database.close()
  dbPromise = null
  snapshotCache = []
  emitChange()
}

void listBodyProgressSnapshots()
