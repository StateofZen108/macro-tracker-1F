import type { WeightEntry } from '../../../types'
import { convertWeight } from '../../../utils/macros'
import { average, dayDiff, roundTo } from './_helpers'
import type { CoachingEngineInputContext, TrendPoint, TrendSummary } from './_types'

function buildRollingTrendPoints(weights: WeightEntry[], dates: string[]): TrendPoint[] {
  const weightIndex = new Map<string, number>()
  for (const entry of weights) {
    if (entry.deletedAt) {
      continue
    }

    weightIndex.set(entry.date, convertWeight(entry.weight, entry.unit, 'lb'))
  }

  return dates.map((date, index) => {
    const windowDates = dates.slice(Math.max(0, index - 6), index + 1)
    const windowValues = windowDates
      .map((windowDate) => weightIndex.get(windowDate))
      .filter((value): value is number => value !== undefined)

    return {
      date,
      scaleWeightLb: weightIndex.get(date) ?? null,
      trendWeightLb: windowValues.length >= 3 ? average(windowValues) : null,
    }
  })
}

function computeObservedWeeklyRatePercent(
  firstTrendWeightLb: number,
  lastTrendWeightLb: number,
  elapsedDays: number,
): number | null {
  if (firstTrendWeightLb <= 0 || elapsedDays <= 0) {
    return null
  }

  return roundTo((((lastTrendWeightLb - firstTrendWeightLb) / firstTrendWeightLb) * 7 * 100) / elapsedDays, 2)
}

function computeEstimatedTdee(
  avgEligibleCalories: number | null,
  weightChangeLb: number | null,
  elapsedDays: number,
): number | null {
  if (avgEligibleCalories === null || weightChangeLb === null || elapsedDays <= 0) {
    return null
  }

  return roundTo(avgEligibleCalories - ((weightChangeLb * 3500) / elapsedDays), 0)
}

export function evaluateCoachingTrend(
  context: CoachingEngineInputContext,
  avgEligibleCalories: number | null,
): TrendSummary {
  const points = buildRollingTrendPoints(context.weightsInWindow, context.series.map((point) => point.date))
  const trendedPoints = points.filter((point) => point.trendWeightLb !== null)
  const firstTrendPoint = trendedPoints[0]
  const lastTrendPoint = trendedPoints[trendedPoints.length - 1]
  const weightChangeLb =
    firstTrendPoint?.trendWeightLb !== null &&
    firstTrendPoint?.trendWeightLb !== undefined &&
    lastTrendPoint?.trendWeightLb !== null &&
    lastTrendPoint?.trendWeightLb !== undefined
      ? roundTo(lastTrendPoint.trendWeightLb - firstTrendPoint.trendWeightLb, 2)
      : null
  const elapsedDays =
    firstTrendPoint && lastTrendPoint ? dayDiff(firstTrendPoint.date, lastTrendPoint.date) : 0
  const observedWeeklyRatePercent =
    firstTrendPoint?.trendWeightLb !== null &&
    firstTrendPoint?.trendWeightLb !== undefined &&
    lastTrendPoint?.trendWeightLb !== null &&
    lastTrendPoint?.trendWeightLb !== undefined
      ? computeObservedWeeklyRatePercent(firstTrendPoint.trendWeightLb, lastTrendPoint.trendWeightLb, elapsedDays)
      : null
  const estimatedTdee = computeEstimatedTdee(avgEligibleCalories, weightChangeLb, elapsedDays)

  return {
    points,
    firstTrendDate: firstTrendPoint?.date,
    lastTrendDate: lastTrendPoint?.date,
    latestTrendWeightLb: lastTrendPoint?.trendWeightLb ?? null,
    weightChangeLb,
    elapsedDays,
    observedWeeklyRatePercent,
    estimatedTdee,
  }
}
