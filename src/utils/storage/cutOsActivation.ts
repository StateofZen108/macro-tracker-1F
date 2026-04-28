import type { ActionResult, CutOsActivationState } from '../../types'
import { createExtraSingletonStore } from './extraStore'

const STORAGE_KEY = 'mt_cut_os_activation'
const EMPTY_UPDATED_AT = '1970-01-01T00:00:00.000Z'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function initialCutOsActivationState(): CutOsActivationState {
  return {
    demoActive: false,
    updatedAt: EMPTY_UPDATED_AT,
  }
}

function normalizeCutOsActivationState(value: unknown): CutOsActivationState {
  if (!isRecord(value)) {
    return initialCutOsActivationState()
  }

  return {
    demoActive: value.demoActive === true,
    dismissedAt: readString(value.dismissedAt),
    updatedAt: readString(value.updatedAt) ?? EMPTY_UPDATED_AT,
  }
}

const store = createExtraSingletonStore<CutOsActivationState>({
  key: STORAGE_KEY,
  initial: initialCutOsActivationState,
  parse: normalizeCutOsActivationState,
})

export function loadCutOsActivationState(): CutOsActivationState {
  return store.load()
}

export function saveCutOsActivationState(state: CutOsActivationState): ActionResult<void> {
  return store.save(normalizeCutOsActivationState(state))
}

export function subscribeToCutOsActivationState(listener: () => void): () => void {
  return store.subscribe(listener)
}
