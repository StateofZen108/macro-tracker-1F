import type {
  DayStatus,
  DailyCoachingSeriesV1,
} from '../../types'
import type { NutrientProfileV1 } from '../nutrition'

export interface DailyCoachingPointV1 {
  series: DailyCoachingSeriesV1
  date: string
  status: DayStatus
  hasEntries: boolean
  entryCount: number
  nutrients: NutrientProfileV1
  countsTowardIntake: boolean
  countsTowardEligibility: boolean
  countsTowardExplicitEligibility: boolean
  countsAsEatingDay: boolean
  fasting: boolean
  partial: boolean
  complete: boolean
  unmarkedLogged: boolean
}

export interface DailyCoachingSeriesSummaryV1 {
  intakeDays: number
  eligibleDays: number
  explicitEligibleDays: number
  completeDays: number
  partialDays: number
  fastingDays: number
  unmarkedLoggedDays: number
  eatingDays: number
  avgEligibleCalories: number | null
  avgEligibleProtein: number | null
}

export type CoachingRecommendationStatusV1 = 'notEnoughData' | 'trendOnly' | 'actionable'

export type {
  CoachingExplanationV1,
  CoachingInputV1,
  CoachingRecommendationV1,
  DailyCoachingSeriesV1,
} from '../../types'
