import type {
  CutOsActionRecord,
  CutOsActionTarget,
  CutOsCommand,
  CutOsSnapshot,
  CutOsSurfaceModel,
  CutOsSetupChecklistItem,
} from '../types'

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}

function createRecordId(command: CutOsCommand, now: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return [
    'cut-os-action',
    sanitizeIdPart(command.date),
    sanitizeIdPart(command.diagnosisId),
    sanitizeIdPart(now),
    randomPart,
  ].join(':')
}

export function createCutOsActionRecord(input: {
  command: CutOsCommand
  actionTarget?: CutOsActionTarget
  now?: string
}): CutOsActionRecord {
  const now = input.now ?? new Date().toISOString()
  return {
    id: createRecordId(input.command, now),
    commandId: `${input.command.date}:${input.command.diagnosisId}`,
    diagnosisId: input.command.diagnosisId,
    date: input.command.date,
    actionTarget: input.actionTarget ?? input.command.cta.target,
    status: 'proposed',
    createdAt: now,
    updatedAt: now,
  }
}

export function markCutOsActionApplied(
  record: CutOsActionRecord,
  now = new Date().toISOString(),
): CutOsActionRecord {
  return {
    ...record,
    status: 'applied',
    appliedAt: now,
    updatedAt: now,
    failureCode: undefined,
    failureMessage: undefined,
  }
}

export function markCutOsActionDeferred(
  record: CutOsActionRecord,
  now = new Date().toISOString(),
): CutOsActionRecord {
  return {
    ...record,
    status: 'deferred',
    deferredAt: now,
    updatedAt: now,
    failureCode: undefined,
    failureMessage: undefined,
  }
}

export function markCutOsActionFailed(
  record: CutOsActionRecord,
  failure: { code: string; message: string },
  now = new Date().toISOString(),
): CutOsActionRecord {
  return {
    ...record,
    status: 'failed',
    failureCode: failure.code,
    failureMessage: failure.message,
    updatedAt: now,
  }
}

export function findActiveCutOsAction(
  command: CutOsCommand,
  actionHistory: CutOsActionRecord[],
): CutOsActionRecord | null {
  return (
    actionHistory
      .filter(
        (record) =>
          record.date === command.date &&
          record.diagnosisId === command.diagnosisId &&
          record.commandId === `${command.date}:${command.diagnosisId}`,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  )
}

export function buildCutOsSurfaceModel(input: {
  snapshot: CutOsSnapshot | null
  setup: CutOsSetupChecklistItem[]
  actionHistory: CutOsActionRecord[]
}): CutOsSurfaceModel | null {
  if (!input.snapshot) {
    return null
  }

  const activeAction = findActiveCutOsAction(input.snapshot.command, input.actionHistory)

  return {
    ...input.snapshot,
    setup: input.setup,
    actionHistory: input.actionHistory,
    activeAction,
  }
}
