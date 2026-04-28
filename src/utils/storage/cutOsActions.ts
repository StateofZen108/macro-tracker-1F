import type { ActionResult, CutOsActionRecord, CutOsActionStatus, CutOsActionTarget } from '../../types'
import { createExtraCollectionStore } from './extraStore'

const STORAGE_KEY = 'mt_cut_os_actions'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isActionStatus(value: unknown): value is CutOsActionStatus {
  return value === 'proposed' || value === 'applied' || value === 'deferred' || value === 'failed'
}

function isActionTarget(value: unknown): value is CutOsActionTarget {
  return (
    value === 'log' ||
    value === 'review_food' ||
    value === 'train' ||
    value === 'weigh_in' ||
    value === 'body_progress' ||
    value === 'coach' ||
    value === 'phase' ||
    value === 'settings' ||
    value === 'hold'
  )
}

function normalizeCutOsActionRecord(value: unknown): CutOsActionRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const commandId = readString(value.commandId)
  const diagnosisId = readString(value.diagnosisId)
  const date = readString(value.date)
  const createdAt = readString(value.createdAt)
  const updatedAt = readString(value.updatedAt)
  if (
    !id ||
    !commandId ||
    !diagnosisId ||
    !date ||
    !isActionTarget(value.actionTarget) ||
    !isActionStatus(value.status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  return {
    id,
    commandId,
    diagnosisId,
    date: date.slice(0, 10),
    actionTarget: value.actionTarget,
    status: value.status,
    createdAt,
    updatedAt,
    appliedAt: readString(value.appliedAt),
    deferredAt: readString(value.deferredAt),
    failureCode: readString(value.failureCode),
    failureMessage: readString(value.failureMessage),
  }
}

function sortRecords(records: CutOsActionRecord[]): CutOsActionRecord[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

const store = createExtraCollectionStore<CutOsActionRecord>({
  key: STORAGE_KEY,
  parse: (value) =>
    Array.isArray(value)
      ? value
          .map((entry) => normalizeCutOsActionRecord(entry))
          .filter((entry): entry is CutOsActionRecord => entry !== null)
      : [],
  sort: sortRecords,
})

export function loadCutOsActions(): CutOsActionRecord[] {
  return store.load()
}

export function saveCutOsActions(records: CutOsActionRecord[]): ActionResult<void> {
  return store.save(records)
}

export function upsertCutOsAction(record: CutOsActionRecord): ActionResult<void> {
  const existingRecords = loadCutOsActions()
  const nextRecords = existingRecords.some((entry) => entry.id === record.id)
    ? existingRecords.map((entry) => (entry.id === record.id ? record : entry))
    : [record, ...existingRecords]
  return saveCutOsActions(nextRecords)
}

export function subscribeToCutOsActions(listener: () => void): () => void {
  return store.subscribe(listener)
}
