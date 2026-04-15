import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type {
  GarminAuthSession,
  GarminConnectionRecord,
  GarminWellnessEntry,
} from './types'

export interface GarminStateDocument {
  version: 1
  connections: Record<string, GarminConnectionRecord>
  sessions: Record<string, GarminAuthSession>
  wellnessEntries: Record<string, GarminWellnessEntry[]>
}

export interface GarminStateStore {
  load(): Promise<GarminStateDocument>
  save(next: GarminStateDocument): Promise<void>
  update(mutator: (current: GarminStateDocument) => GarminStateDocument | Promise<GarminStateDocument>): Promise<GarminStateDocument>
}

interface FileGarminStateStoreOptions {
  stateDir?: string | null
  fileName?: string
  initialState?: Partial<GarminStateDocument>
}

function cloneState(document: GarminStateDocument): GarminStateDocument {
  return {
    version: 1,
    connections: structuredClone(document.connections),
    sessions: structuredClone(document.sessions),
    wellnessEntries: structuredClone(document.wellnessEntries),
  }
}

function normalizeStateDocument(
  document: Partial<GarminStateDocument> | null | undefined,
): GarminStateDocument {
  return {
    version: 1,
    connections: structuredClone(document?.connections ?? {}),
    sessions: structuredClone(document?.sessions ?? {}),
    wellnessEntries: structuredClone(document?.wellnessEntries ?? {}),
  }
}

function createMemoryGarminStateStore(
  initialState?: Partial<GarminStateDocument>,
): GarminStateStore {
  let state = normalizeStateDocument(initialState)

  return {
    async load() {
      return cloneState(state)
    },
    async save(next) {
      state = cloneState(normalizeStateDocument(next))
    },
    async update(mutator) {
      const next = normalizeStateDocument(await mutator(cloneState(state)))
      state = cloneState(next)
      return cloneState(state)
    },
  }
}

function createFileGarminStateStore(
  options: {
    stateDir: string
    fileName: string
    initialState?: Partial<GarminStateDocument>
  },
): GarminStateStore {
  const filePath = join(options.stateDir, options.fileName)
  let loadedState: GarminStateDocument | null = null
  const initialState = normalizeStateDocument(options.initialState)

  async function readState(): Promise<GarminStateDocument> {
    if (loadedState) {
      return cloneState(loadedState)
    }

    try {
      const raw = await readFile(filePath, 'utf8')
      loadedState = normalizeStateDocument(JSON.parse(raw) as Partial<GarminStateDocument>)
    } catch {
      loadedState = cloneState(initialState)
    }

    return cloneState(loadedState ?? initialState)
  }

  async function writeState(next: GarminStateDocument): Promise<void> {
    loadedState = cloneState(normalizeStateDocument(next))
    await mkdir(dirname(filePath), { recursive: true })
    const tempFilePath = `${filePath}.tmp`
    await writeFile(tempFilePath, `${JSON.stringify(loadedState, null, 2)}\n`, 'utf8')
    await rename(tempFilePath, filePath)
  }

  return {
    load: readState,
    save: writeState,
    async update(mutator) {
      const current = await readState()
      const next = normalizeStateDocument(await mutator(cloneState(current)))
      await writeState(next)
      return cloneState(next)
    },
  }
}

export function createGarminStateStore(
  options: FileGarminStateStoreOptions = {},
): GarminStateStore {
  const stateDir = options.stateDir ?? process.env.GARMIN_STATE_DIR?.trim() ?? null
  const fileName = options.fileName ?? 'garmin-state.json'

  if (!stateDir) {
    return createMemoryGarminStateStore(options.initialState)
  }

  return createFileGarminStateStore({
    stateDir,
    fileName,
    initialState: options.initialState,
  })
}

export function createGarminConnectionRecord(
  userId: string,
  now: Date = new Date(),
): GarminConnectionRecord {
  const timestamp = now.toISOString()

  return {
    userId,
    status: 'not_connected',
    createdAt: timestamp,
    updatedAt: timestamp,
    failureCount: 0,
    lastWatermarks: {},
    staleData: false,
  }
}

export async function getGarminConnectionRecord(
  store: GarminStateStore,
  userId: string,
): Promise<GarminConnectionRecord> {
  const state = await store.load()
  return state.connections[userId] ?? createGarminConnectionRecord(userId)
}

export async function saveGarminConnectionRecord(
  store: GarminStateStore,
  record: GarminConnectionRecord,
): Promise<GarminConnectionRecord> {
  await store.update(async (current) => {
    const next = cloneState(current)
    next.connections[record.userId] = structuredClone(record)
    return next
  })

  return record
}

export async function removeGarminConnectionRecord(
  store: GarminStateStore,
  userId: string,
): Promise<void> {
  await store.update(async (current) => {
    const next = cloneState(current)
    delete next.connections[userId]
    for (const [stateKey, session] of Object.entries(next.sessions)) {
      if (session.userId === userId) {
        delete next.sessions[stateKey]
      }
    }
    return next
  })
}

export async function removeGarminAuthSessionsForUser(
  store: GarminStateStore,
  userId: string,
): Promise<void> {
  await store.update(async (current) => {
    const next = cloneState(current)
    for (const [stateKey, session] of Object.entries(next.sessions)) {
      if (session.userId === userId) {
        delete next.sessions[stateKey]
      }
    }
    return next
  })
}

export async function saveGarminAuthSession(
  store: GarminStateStore,
  session: GarminAuthSession,
): Promise<GarminAuthSession> {
  await store.update(async (current) => {
    const next = cloneState(current)
    next.sessions[session.state] = structuredClone(session)
    return next
  })

  return session
}

export async function consumeGarminAuthSession(
  store: GarminStateStore,
  state: string,
): Promise<GarminAuthSession | null> {
  let consumedSession: GarminAuthSession | null = null
  await store.update(async (current) => {
    const next = cloneState(current)
    consumedSession = next.sessions[state] ? structuredClone(next.sessions[state]) : null
    delete next.sessions[state]
    return next
  })

  return consumedSession
}

export async function getGarminAuthSession(
  store: GarminStateStore,
  state: string,
): Promise<GarminAuthSession | null> {
  const stateDocument = await store.load()
  return stateDocument.sessions[state] ?? null
}

export async function listGarminWellnessEntries(
  store: GarminStateStore,
  userId: string,
): Promise<GarminWellnessEntry[]> {
  const state = await store.load()
  return [...(state.wellnessEntries[userId] ?? [])]
}

export async function saveGarminWellnessEntries(
  store: GarminStateStore,
  userId: string,
  entries: GarminWellnessEntry[],
): Promise<GarminWellnessEntry[]> {
  const normalized = new Map<string, GarminWellnessEntry>()
  for (const entry of entries) {
    normalized.set(entry.date, structuredClone(entry))
  }

  await store.update(async (current) => {
    const next = cloneState(current)
    const existing = next.wellnessEntries[userId] ?? []
    for (const entry of existing) {
      normalized.set(entry.date, structuredClone(entry))
    }
    next.wellnessEntries[userId] = [...normalized.values()].sort((left, right) =>
      right.date.localeCompare(left.date),
    )
    return next
  })

  return [...normalized.values()].sort((left, right) => right.date.localeCompare(left.date))
}
