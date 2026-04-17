import { registerSW } from './register'
import { APP_BUILD_ID } from '../config/buildInfo'

export interface PwaRuntimeState {
  currentBuildId: string
  waitingWorkerPresent: boolean
  waitingBuildId: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()

let initialized = false
let snapshot: PwaRuntimeState = {
  currentBuildId: APP_BUILD_ID,
  waitingWorkerPresent: false,
  waitingBuildId: null,
}
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

async function resolveWaitingWorkerBuildId(
  waitingWorker: ServiceWorker,
  timeoutMs = 1000,
): Promise<string | null> {
  if (typeof MessageChannel === 'undefined') {
    return null
  }

  return new Promise<string | null>((resolve) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timeout)
      channel.port1.onmessage = null
      channel.port1.close()
      channel.port2.close()
    }

    channel.port1.onmessage = (event: MessageEvent<{ type?: string; buildId?: string }>) => {
      if (event.data?.type === 'MT_BUILD_ID' && typeof event.data.buildId === 'string') {
        cleanup()
        resolve(event.data.buildId)
      }
    }

    try {
      waitingWorker.postMessage({ type: 'MT_GET_BUILD_ID' }, [channel.port2])
    } catch {
      cleanup()
      resolve(null)
    }
  })
}

function setSnapshot(nextSnapshot: PwaRuntimeState): void {
  snapshot = nextSnapshot
  emit()
}

export async function refreshPwaRuntimeSnapshot(): Promise<PwaRuntimeState> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    const nextSnapshot = {
      currentBuildId: APP_BUILD_ID,
      waitingWorkerPresent: false,
      waitingBuildId: null,
    } satisfies PwaRuntimeState
    setSnapshot(nextSnapshot)
    return nextSnapshot
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const waitingWorker = registration?.waiting ?? null

    if (!waitingWorker) {
      const nextSnapshot = {
        currentBuildId: APP_BUILD_ID,
        waitingWorkerPresent: false,
        waitingBuildId: null,
      } satisfies PwaRuntimeState
      setSnapshot(nextSnapshot)
      return nextSnapshot
    }

    const waitingBuildId = await resolveWaitingWorkerBuildId(waitingWorker)
    const nextSnapshot = {
      currentBuildId: APP_BUILD_ID,
      waitingWorkerPresent: true,
      waitingBuildId,
    } satisfies PwaRuntimeState
    setSnapshot(nextSnapshot)
    return nextSnapshot
  } catch {
    const nextSnapshot = {
      currentBuildId: APP_BUILD_ID,
      waitingWorkerPresent: false,
      waitingBuildId: null,
    } satisfies PwaRuntimeState
    setSnapshot(nextSnapshot)
    return nextSnapshot
  }
}

export function initializePwaRuntime(): void {
  if (initialized) {
    return
  }

  initialized = true
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      void refreshPwaRuntimeSnapshot()
    },
  })

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setSnapshot({
        currentBuildId: APP_BUILD_ID,
        waitingWorkerPresent: false,
        waitingBuildId: null,
      })
    })
  }

  void refreshPwaRuntimeSnapshot()
}

export function subscribePwaRuntime(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPwaRuntimeSnapshot(): PwaRuntimeState {
  return snapshot
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateServiceWorker) {
    return
  }

  await updateServiceWorker(true)
}
