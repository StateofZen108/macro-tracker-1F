import { registerSW } from 'virtual:pwa-register'

interface PwaRuntimeState {
  updateReady: boolean
}

type Listener = () => void

const listeners = new Set<Listener>()

let initialized = false
let snapshot: PwaRuntimeState = {
  updateReady: false,
}
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

function emit(): void {
  for (const listener of listeners) {
    listener()
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
      snapshot = {
        updateReady: true,
      }
      emit()
    },
  })
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

  snapshot = {
    updateReady: false,
  }
  emit()
  await updateServiceWorker(true)
}
