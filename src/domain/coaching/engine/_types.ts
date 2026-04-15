import type {
  AdherenceScore,
  ActivityEntry,
  CheckInMacroTargets,
  CoachingBlockedReason,
  CoachingConfidence,
  CoachingDecisionType,
  CoachingExplanationV1,
  CoachingInputV1,
  CoachingReasonCode,
  CoachingRecommendationV1,
  CoachingTargetSet,
  ConfounderSet,
  DataQualityScore,
  DailyCoachingSeriesV1,
  DayMeta,
  FoodLogEntry,
  InterventionEntry,
  LegacyCoachingCode,
  UserSettings,
  WeightEntry,
} from '../../../types'
import type { CoachRuntimeAssessment, CoachRuntimeState } from '../runtime'

export interface CoachingEngineBuildParams {
  windowEnd: string
  settings: UserSettings
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
  weights: WeightEntry[]
  activityLog?: ActivityEntry[]
  interventions?: InterventionEntry[]
  recoveryIssueCount?: number
}

export interface CoachingEngineInputContext {
  windowStart: string
  windowEnd: string
  settings: UserSettings
  runtime?: CoachRuntimeState
  input: CoachingInputV1
  series: DailyCoachingSeriesV1[]
  weightsInWindow: WeightEntry[]
  interventionsInWindow: InterventionEntry[]
  recoveryIssueCount: number
  recentlyImported: boolean
}

export interface SeriesSummary {
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
  weighInDays: number
  markedConfounderDays: number
}

export interface TrendPoint {
  date: string
  scaleWeightLb: number | null
  trendWeightLb: number | null
}

export interface TrendSummary {
  points: TrendPoint[]
  firstTrendDate?: string
  lastTrendDate?: string
  latestTrendWeightLb: number | null
  weightChangeLb: number | null
  elapsedDays: number
  observedWeeklyRatePercent: number | null
  estimatedTdee: number | null
}

export interface InterventionSummary {
  confounders: string[]
  hasRecentChanges: boolean
  hasStableRecentUse: boolean
}

export interface QualityAssessment {
  summary: SeriesSummary
  intervention: InterventionSummary
  confidenceScore: number | null
  confidenceBand: CoachingConfidence
  blockedReasons: CoachingBlockedReason[]
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
  dataQuality: DataQualityScore
  adherence: AdherenceScore
  confounders: ConfounderSet
  blockedBy: string[]
  status: 'actionable' | 'trendOnly' | 'notEnoughData'
  isActionable: boolean
  adherenceTone: 'neutral' | 'under' | 'over' | 'onTrack'
  runtime?: CoachRuntimeAssessment
}

export interface PolicyDecision {
  decisionType: CoachingDecisionType
  recommendedCalories: number | null
  recommendedMacros?: CheckInMacroTargets
  previousTargets: CoachingTargetSet
  proposedTargets?: CoachingTargetSet
  calorieDelta: number | null
  allDayTargetFromTdee: number | null
  eatingDayTargetFromTdee: number | null
  estimatedTdee: number | null
  reason: string
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
  effectiveDate: string
}

export interface CoachingEngineEvaluation {
  context: CoachingEngineInputContext
  summary: SeriesSummary
  trend: TrendSummary
  intervention: InterventionSummary
  quality: QualityAssessment
  policy: PolicyDecision
  recommendation: CoachingRecommendationV1
  explanation: CoachingExplanationV1
}

export interface CoachingHistoryEntry {
  id: string
  windowStart: string
  windowEnd: string
  generatedAt: string
  confidenceScore: number | null
  confidenceBand: CoachingConfidence
  recommendedCalories: number | null
  estimatedTdee: number | null
  eligibleDays: number
  weighInDays: number
  fastingDays: number
  partialDays: number
  unmarkedLoggedDays: number
  recentlyImported: boolean
  confounders: string[]
  reason: string
}
