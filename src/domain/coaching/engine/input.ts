import type { ActivityEntry, InterventionEntry, WeightEntry } from '../../../types'
import { convertWeight } from '../../../utils/macros'
import { buildDailyCoachingSeriesV1 } from '../series'
import { readCoachRuntimeState, type CoachWellnessRecord } from '../runtime'
import { COACH_ENGINE_CONFIG } from './_constants'
import { buildWindowDates, compareDateKeys } from './_helpers'
import type { CoachingEngineBuildParams, CoachingEngineInputContext } from './_types'

function buildActivityMap(activityLog: ActivityEntry[]): Map<string, ActivityEntry> {
  return new Map(activityLog.map((entry) => [entry.date, entry]))
}

function buildWeightMap(weights: WeightEntry[]): Map<string, WeightEntry> {
  return new Map(weights.map((entry) => [entry.date, entry]))
}

function buildWellnessMap(
  runtime: ReturnType<typeof readCoachRuntimeState>,
): Map<string, CoachWellnessRecord> {
  return new Map((runtime?.recovery?.wellness ?? []).map((entry) => [entry.date, entry] as const))
}

function buildRecentImportFlag(lastImportAt: string | undefined, windowEnd: string): boolean {
  if (!lastImportAt) {
    return false
  }

  return (
    compareDateKeys(lastImportAt.slice(0, 10), buildWindowDates(windowEnd, COACH_ENGINE_CONFIG.recentImportBlockDays).windowStart) >=
    0
  )
}

function filterInterventionsInWindow(
  interventions: InterventionEntry[],
  windowStart: string,
  windowEnd: string,
): InterventionEntry[] {
  return interventions.filter(
    (entry) =>
      !entry.deletedAt &&
      compareDateKeys(entry.date, windowStart) >= 0 &&
      compareDateKeys(entry.date, windowEnd) <= 0,
  )
}

function filterWeightsInWindow(weights: WeightEntry[], windowStart: string, windowEnd: string): WeightEntry[] {
  return weights.filter(
    (entry) =>
      !entry.deletedAt &&
      compareDateKeys(entry.date, windowStart) >= 0 &&
      compareDateKeys(entry.date, windowEnd) <= 0,
  )
}

export function buildCoachingEngineInput(params: CoachingEngineBuildParams): CoachingEngineInputContext {
  const { windowStart } = buildWindowDates(params.windowEnd, COACH_ENGINE_CONFIG.windowDays)
  const recentImport = buildRecentImportFlag(params.settings.lastImportAt, params.windowEnd)
  const weightsInWindow = filterWeightsInWindow(params.weights, windowStart, params.windowEnd)
  const interventionsInWindow = filterInterventionsInWindow(
    params.interventions ?? [],
    windowStart,
    params.windowEnd,
  )
  const activityByDate = buildActivityMap(params.activityLog ?? [])
  const weightByDate = buildWeightMap(weightsInWindow)

  const baseSeries = buildDailyCoachingSeriesV1(
    windowStart,
    params.windowEnd,
    params.logsByDate,
    params.dayMeta,
  )
  const runtime = readCoachRuntimeState(params.settings)
  const wellnessByDate = buildWellnessMap(runtime)

  const series = baseSeries.map((point) => {
    const activity = activityByDate.get(point.date)
    const wellness = wellnessByDate.get(point.date)
    const weighIn = weightByDate.get(point.date)
    return {
      ...point.series,
      recentImport,
      steps: activity?.steps ?? wellness?.steps,
      cardioMinutes: activity?.cardioMinutes ?? wellness?.derivedCardioMinutes,
      cardioType: activity?.cardioType,
      weighIn: weighIn
        ? {
            ...weighIn,
            weight: convertWeight(weighIn.weight, weighIn.unit, 'lb'),
            unit: 'lb' as const,
          }
        : undefined,
    }
  })

  return {
    windowStart,
    windowEnd: params.windowEnd,
    settings: params.settings,
    runtime,
    input: {
      windowStart,
      windowEnd: params.windowEnd,
      goalMode: params.settings.goalMode,
      targetWeeklyRatePercent: params.settings.targetWeeklyRatePercent,
      calorieTarget: params.settings.calorieTarget,
      proteinTarget: params.settings.proteinTarget,
      carbTarget: params.settings.carbTarget,
      fatTarget: params.settings.fatTarget,
      dailyStepTarget: params.settings.dailyStepTarget,
      weeklyCardioMinuteTarget: params.settings.weeklyCardioMinuteTarget,
      series,
    },
    series,
    weightsInWindow,
    interventionsInWindow,
    recoveryIssueCount: params.recoveryIssueCount ?? 0,
    recentlyImported: recentImport,
  }
}
