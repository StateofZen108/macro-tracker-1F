import type {
  CutOsHistoricalReplayReport,
  CutOsSurfaceModel,
} from '../types'

interface BuildCutOsHistoricalReplayReportInput {
  buildId: string
  checkedAt?: string
  surfaces: CutOsSurfaceModel[]
}

function uniqueSortedDates(surfaces: CutOsSurfaceModel[]): string[] {
  return [...new Set(surfaces.map((surface) => surface.command.date))].sort()
}

function isHarderCutEscalation(surface: CutOsSurfaceModel): boolean {
  const actionText = `${surface.command.primaryAction} ${surface.command.cta.label}`.toLowerCase()
  return (
    actionText.includes('cut calories') ||
    actionText.includes('lower calories') ||
    actionText.includes('reduce calories') ||
    actionText.includes('raise steps') ||
    actionText.includes('increase steps')
  )
}

export function buildCutOsHistoricalReplayReport(
  input: BuildCutOsHistoricalReplayReportInput,
): CutOsHistoricalReplayReport {
  const dates = uniqueSortedDates(input.surfaces)
  const start = dates[0] ?? ''
  const end = dates.at(-1) ?? ''
  const actionableSurfaces = input.surfaces.filter(
    (surface) => surface.command.state === 'command_issued' || surface.command.state === 'blocked',
  )

  return {
    buildId: input.buildId,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    replayWindow: { start, end },
    reconstructedDays: dates.length,
    trueStallsDetected: input.surfaces.filter(
      (surface) => surface.diagnosis.scaleVerdict === 'true_stall',
    ).length,
    expectedSpikesSuppressed: input.surfaces.filter((surface) =>
      surface.diagnosis.scaleVerdict === 'expected_spike' ||
      surface.diagnosis.scaleVerdict === 'confounded_stall',
    ).length,
    trainingLeaksPrioritized: input.surfaces.filter((surface) =>
      surface.diagnosis.trainingVerdict === 'leaking' ||
      surface.diagnosis.verdict === 'protect_training',
    ).length,
    foodTrustBlocksCaught: input.surfaces.filter((surface) =>
      surface.diagnosis.foodTrustVerdict !== 'trusted_for_coaching' ||
      surface.diagnosis.blockedBy.some((blocker) => blocker.includes('food')),
    ).length,
    falseEscalations: input.surfaces.filter((surface) =>
      isHarderCutEscalation(surface) &&
      (
        surface.diagnosis.foodTrustVerdict !== 'trusted_for_coaching' ||
        surface.diagnosis.trainingVerdict === 'leaking' ||
        surface.diagnosis.scaleVerdict === 'expected_spike' ||
        surface.diagnosis.scaleVerdict === 'confounded_stall'
      ),
    ).length,
    missedActionableDays: actionableSurfaces.filter(
      (surface) =>
        surface.diagnosis.scaleVerdict === 'true_stall' &&
        surface.command.state !== 'command_issued',
    ).length,
  }
}

export function buildCurrentCutOsReplayReport(input: {
  buildId: string
  surface: CutOsSurfaceModel | null
  checkedAt?: string
}): CutOsHistoricalReplayReport {
  return buildCutOsHistoricalReplayReport({
    buildId: input.buildId,
    checkedAt: input.checkedAt,
    surfaces: input.surface ? [input.surface] : [],
  })
}
