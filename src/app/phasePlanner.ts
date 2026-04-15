import type { DietPhase } from '../types'

export function getEffectivePhaseEndDate(phase: Pick<DietPhase, 'actualEndDate' | 'plannedEndDate'>): string {
  return phase.actualEndDate ?? phase.plannedEndDate
}

function compareDescendingDate(left: string, right: string): number {
  return right.localeCompare(left)
}

function compareAscendingDate(left: string, right: string): number {
  return left.localeCompare(right)
}

export function sortHistoricalPhases(phases: DietPhase[]): DietPhase[] {
  return [...phases].sort((left, right) => {
    const endComparison = compareDescendingDate(
      getEffectivePhaseEndDate(left),
      getEffectivePhaseEndDate(right),
    )
    if (endComparison !== 0) {
      return endComparison
    }

    return compareDescendingDate(left.updatedAt, right.updatedAt)
  })
}

export function sortSelectablePsmfPhases(phases: DietPhase[]): DietPhase[] {
  return [...phases].sort((left, right) => {
    const leftPriority = left.status === 'active' ? 0 : left.status === 'planned' ? 1 : 2
    const rightPriority = right.status === 'active' ? 0 : right.status === 'planned' ? 1 : 2
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    if (leftPriority <= 1) {
      const startComparison = compareAscendingDate(left.startDate, right.startDate)
      if (startComparison !== 0) {
        return startComparison
      }
    } else {
      const endComparison = compareDescendingDate(
        getEffectivePhaseEndDate(left),
        getEffectivePhaseEndDate(right),
      )
      if (endComparison !== 0) {
        return endComparison
      }
    }

    return compareDescendingDate(left.updatedAt, right.updatedAt)
  })
}

function getDefaultSelectedPsmfPhaseId(phases: DietPhase[]): string | null {
  const activePhase = phases.find((phase) => phase.status === 'active')
  if (activePhase) {
    return activePhase.id
  }

  const earliestPlanned = [...phases]
    .filter((phase) => phase.status === 'planned')
    .sort((left, right) => compareAscendingDate(left.startDate, right.startDate))[0]
  if (earliestPlanned) {
    return earliestPlanned.id
  }

  return sortHistoricalPhases(phases.filter((phase) => phase.status !== 'cancelled'))[0]?.id ?? null
}

export function resolveSelectedPsmfPhaseId(
  phases: DietPhase[],
  currentSelection: string | null,
): string | null {
  if (
    currentSelection &&
    phases.some(
      (phase) =>
        phase.id === currentSelection &&
        phase.type === 'psmf' &&
        phase.status !== 'cancelled',
    )
  ) {
    return currentSelection
  }

  return getDefaultSelectedPsmfPhaseId(phases)
}

export function getDefaultPsmfPhaseSelection(phases: DietPhase[]): string | null {
  return getDefaultSelectedPsmfPhaseId(phases)
}
