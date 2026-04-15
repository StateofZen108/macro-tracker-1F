import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BackupFile } from '../../types'

const SAFETY_DB_NAME = 'macrotracker-safety'
const SAFETY_DB_VERSION = 1
const SAFETY_STORE = 'snapshots'
const MAX_SAFETY_SNAPSHOTS = 7

export type SafetySnapshotReason =
  | 'daily-auto'
  | 'pre-import-replace'
  | 'pre-import-merge'
  | 'pre-recovery-restore'

export interface SafetySnapshotRecord {
  id: string
  createdAt: string
  reason: SafetySnapshotReason
  backupSchemaVersion: number
  backup: BackupFile
}

interface SafetySnapshotDatabase extends DBSchema {
  snapshots: {
    key: string
    value: SafetySnapshotRecord
    indexes: {
      createdAt: string
      reason: SafetySnapshotReason
    }
  }
}

interface SafetySnapshotSummary {
  lastSnapshotAt: string | null
  snapshotCount: number
}

let dbPromise: Promise<IDBPDatabase<SafetySnapshotDatabase>> | null = null
let summarySnapshot: SafetySnapshotSummary = {
  lastSnapshotAt: null,
  snapshotCount: 0,
}
const summaryListeners = new Set<() => void>()

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

async function getDatabase(): Promise<IDBPDatabase<SafetySnapshotDatabase> | null> {
  if (!canUseIndexedDb()) {
    return null
  }

  if (!dbPromise) {
    dbPromise = openDB<SafetySnapshotDatabase>(SAFETY_DB_NAME, SAFETY_DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(SAFETY_STORE)) {
          const store = database.createObjectStore(SAFETY_STORE, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('reason', 'reason', { unique: false })
        }
      },
    })
  }

  return dbPromise
}

async function trimSnapshots(database: IDBPDatabase<SafetySnapshotDatabase>): Promise<void> {
  const snapshots = (await database.getAll(SAFETY_STORE)).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
  const staleSnapshots = snapshots.slice(MAX_SAFETY_SNAPSHOTS)
  if (!staleSnapshots.length) {
    return
  }

  const transaction = database.transaction(SAFETY_STORE, 'readwrite')
  for (const snapshot of staleSnapshots) {
    await transaction.store.delete(snapshot.id)
  }
  await transaction.done
}

function emitSummaryChange(): void {
  for (const listener of summaryListeners) {
    listener()
  }
}

export async function listSafetySnapshots(): Promise<SafetySnapshotRecord[]> {
  const database = await getDatabase()
  if (!database) {
    return []
  }

  const snapshots = await database.getAll(SAFETY_STORE)
  return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function getSafetySnapshotSummarySnapshot(): SafetySnapshotSummary {
  return summarySnapshot
}

export function subscribeSafetySnapshotSummary(listener: () => void): () => void {
  summaryListeners.add(listener)
  return () => {
    summaryListeners.delete(listener)
  }
}

export async function refreshSafetySnapshotSummary(): Promise<SafetySnapshotSummary> {
  const snapshots = await listSafetySnapshots()
  summarySnapshot = {
    lastSnapshotAt: snapshots[0]?.createdAt ?? null,
    snapshotCount: snapshots.length,
  }
  emitSummaryChange()
  return summarySnapshot
}

export async function getLatestSafetySnapshot(): Promise<SafetySnapshotRecord | null> {
  const snapshots = await listSafetySnapshots()
  return snapshots[0] ?? null
}

export async function captureSafetySnapshot(
  backup: BackupFile,
  reason: SafetySnapshotReason,
): Promise<SafetySnapshotRecord | null> {
  const database = await getDatabase()
  if (!database) {
    return null
  }

  const snapshot: SafetySnapshotRecord = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    reason,
    backupSchemaVersion: backup.schemaVersion,
    backup,
  }

  await database.put(SAFETY_STORE, snapshot)
  await trimSnapshots(database)
  await refreshSafetySnapshotSummary()
  return snapshot
}

export async function clearSafetySnapshotsForTests(): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    dbPromise = null
    return
  }

  await database.clear(SAFETY_STORE)
  database.close()
  dbPromise = null
  await refreshSafetySnapshotSummary()
}

void refreshSafetySnapshotSummary()
