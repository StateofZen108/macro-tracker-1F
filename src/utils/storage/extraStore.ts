import type { ActionResult } from '../../types'

type Listener = () => void

const CHANNEL_NAME = 'macrotracker-extra-storage'
const CHANNEL_SOURCE =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `macrotracker-extra-${Date.now()}`

const listenersByKey = new Map<string, Set<Listener>>()
const refreshersByKey = new Map<string, () => void>()
let channel: BroadcastChannel | null = null
let bound = false

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function bindChannel(): void {
  if (bound || typeof window === 'undefined') {
    return
  }

  bound = true
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener(
      'message',
      (event: MessageEvent<{ key?: string; source?: string; type?: string }>) => {
        if (event.data?.type !== 'extra-storage-updated' || event.data.source === CHANNEL_SOURCE) {
          return
        }

        const keyListeners = listenersByKey.get(event.data.key ?? '')
        if (!keyListeners) {
          return
        }

        refreshersByKey.get(event.data.key ?? '')?.()

        for (const listener of keyListeners) {
          listener()
        }
      },
    )
  }
}

function emitChange(key: string): void {
  const keyListeners = listenersByKey.get(key)
  if (keyListeners) {
    for (const listener of keyListeners) {
      listener()
    }
  }

  channel?.postMessage({
    type: 'extra-storage-updated',
    key,
    source: CHANNEL_SOURCE,
  })
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

export function createExtraCollectionStore<T>(options: {
  key: string
  parse: (value: unknown) => T[]
  sort?: (items: T[]) => T[]
}) {
  bindChannel()

  let snapshot: T[] = []
  let initialized = false

  function readFromStorage(): T[] {
    if (!canUseStorage()) {
      return []
    }

    try {
      const rawValue = window.localStorage.getItem(options.key)
      if (!rawValue) {
        return []
      }

      const parsed = options.parse(JSON.parse(rawValue) as unknown)
      return options.sort ? options.sort(parsed) : parsed
    } catch {
      return []
    }
  }

  function refreshSnapshot(): T[] {
    snapshot = readFromStorage()
    initialized = true
    return snapshot
  }

  function load(): T[] {
    if (!initialized) {
      return refreshSnapshot()
    }

    return snapshot
  }

  function save(items: T[]): ActionResult<void> {
    if (!canUseStorage()) {
      return fail('unavailable', 'Browser storage is not available in this environment.')
    }

    const nextItems = options.sort ? options.sort(items) : items
    try {
      window.localStorage.setItem(options.key, JSON.stringify(nextItems))
      snapshot = nextItems
      initialized = true
      emitChange(options.key)
      return ok(undefined)
    } catch {
      return fail('storageWriteFailed', 'Unable to persist local data.')
    }
  }

  function subscribe(listener: Listener): () => void {
    bindChannel()
    const keyListeners = listenersByKey.get(options.key) ?? new Set<Listener>()
    keyListeners.add(listener)
    listenersByKey.set(options.key, keyListeners)
    refreshersByKey.set(options.key, () => {
      refreshSnapshot()
    })
    refreshSnapshot()
    return () => {
      const currentListeners = listenersByKey.get(options.key)
      currentListeners?.delete(listener)
      if (currentListeners && currentListeners.size === 0) {
        listenersByKey.delete(options.key)
        refreshersByKey.delete(options.key)
      }
    }
  }

  function replace(items: T[]): ActionResult<void> {
    return save(items)
  }

  return {
    load,
    save,
    replace,
    subscribe,
  }
}

export function createExtraSingletonStore<T>(options: {
  key: string
  parse: (value: unknown) => T
  initial: () => T
}) {
  bindChannel()

  let snapshot = options.initial()
  let initialized = false

  function readFromStorage(): T {
    if (!canUseStorage()) {
      return options.initial()
    }

    try {
      const rawValue = window.localStorage.getItem(options.key)
      if (!rawValue) {
        return options.initial()
      }

      return options.parse(JSON.parse(rawValue) as unknown)
    } catch {
      return options.initial()
    }
  }

  function refreshSnapshot(): T {
    snapshot = readFromStorage()
    initialized = true
    return snapshot
  }

  function load(): T {
    if (!initialized) {
      return refreshSnapshot()
    }

    return snapshot
  }

  function save(value: T): ActionResult<void> {
    if (!canUseStorage()) {
      return fail('unavailable', 'Browser storage is not available in this environment.')
    }

    try {
      window.localStorage.setItem(options.key, JSON.stringify(value))
      snapshot = value
      initialized = true
      emitChange(options.key)
      return ok(undefined)
    } catch {
      return fail('storageWriteFailed', 'Unable to persist local data.')
    }
  }

  function subscribe(listener: Listener): () => void {
    bindChannel()
    const keyListeners = listenersByKey.get(options.key) ?? new Set<Listener>()
    keyListeners.add(listener)
    listenersByKey.set(options.key, keyListeners)
    refreshersByKey.set(options.key, () => {
      refreshSnapshot()
    })
    refreshSnapshot()
    return () => {
      const currentListeners = listenersByKey.get(options.key)
      currentListeners?.delete(listener)
      if (currentListeners && currentListeners.size === 0) {
        listenersByKey.delete(options.key)
        refreshersByKey.delete(options.key)
      }
    }
  }

  function replace(value: T): ActionResult<void> {
    return save(value)
  }

  return {
    load,
    save,
    replace,
    subscribe,
  }
}
