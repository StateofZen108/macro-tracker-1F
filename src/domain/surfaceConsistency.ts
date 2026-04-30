import type {
  CommandConsistencyReport,
  CommandSurfaceName,
  CommandSurfaceSnapshot,
  CutOsSurfaceModel,
} from '../types'

function sortIds(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function joinIds(values: readonly string[]): string {
  return sortIds(values).join('|')
}

export function buildCommandSurfaceSnapshot(
  surface: CommandSurfaceName,
  model: CutOsSurfaceModel | null,
): CommandSurfaceSnapshot {
  if (!model) {
    return {
      surface,
      proofIds: [],
      actionStatus: 'none',
      setupItemIds: [],
    }
  }

  return {
    surface,
    commandId: `${model.command.date}:${model.command.diagnosisId}`,
    diagnosisId: model.command.diagnosisId,
    primaryAction: model.command.primaryAction,
    proofIds: sortIds(model.command.proofIds),
    actionStatus: model.activeAction?.status ?? 'none',
    setupItemIds: sortIds(model.setup.map((item) => item.id)),
  }
}

export function buildCommandConsistencyReport(input: {
  surfaces: CommandSurfaceSnapshot[]
  checkedAt?: string
}): CommandConsistencyReport {
  const checkedAt = input.checkedAt ?? new Date().toISOString()
  const surfaces = input.surfaces
  if (surfaces.length === 0) {
    return {
      status: 'unverified',
      checkedAt,
      surfaces,
      mismatchReasons: ['No command surfaces were supplied.'],
    }
  }

  const [baseline] = surfaces
  const mismatchReasons: string[] = []

  for (const surface of surfaces.slice(1)) {
    if (surface.commandId !== baseline.commandId) {
      mismatchReasons.push(`${surface.surface} command id does not match ${baseline.surface}.`)
    }

    if (surface.diagnosisId !== baseline.diagnosisId) {
      mismatchReasons.push(`${surface.surface} diagnosis id does not match ${baseline.surface}.`)
    }

    if (surface.primaryAction !== baseline.primaryAction) {
      mismatchReasons.push(`${surface.surface} primary action does not match ${baseline.surface}.`)
    }

    if (joinIds(surface.proofIds) !== joinIds(baseline.proofIds)) {
      mismatchReasons.push(`${surface.surface} proof ids do not match ${baseline.surface}.`)
    }

    if (surface.actionStatus !== baseline.actionStatus) {
      mismatchReasons.push(`${surface.surface} action status does not match ${baseline.surface}.`)
    }

    if (!baseline.commandId && joinIds(surface.setupItemIds) !== joinIds(baseline.setupItemIds)) {
      mismatchReasons.push(`${surface.surface} setup item ids do not match ${baseline.surface}.`)
    }
  }

  return {
    status: mismatchReasons.length > 0 ? 'mismatch' : 'verified',
    checkedAt,
    surfaces,
    mismatchReasons,
  }
}
