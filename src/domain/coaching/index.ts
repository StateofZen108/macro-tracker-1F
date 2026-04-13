export {
  buildCoachingExplanationV1,
  buildCoachingRecommendationV1,
} from './contracts'

export {
  buildCoachingInputV1,
  buildDailyCoachingSeriesV1,
  summarizeDailyCoachingSeriesV1,
} from './series'

export {
  buildCalibrationRecord,
  buildEmptyCoachingInsight,
  COACHING_CONFIG,
  compareDateKeys,
  evaluateCoachingWindow,
  getCalibrationPhase,
  roundCoachingValue,
} from './math'

export {
  buildCoachingDecisionId,
  buildCoachingDecisionRecord,
  buildManualOverrideDecisionRecord,
  evaluateCoachEngineV1,
  updateCoachingDecisionRecordStatus,
  upsertCoachingDecisionRecord,
} from './engine'

export {
  compareCoachingShadowMode,
  runCoachingReplayScenario,
} from './validation'

export type {
  CoachingRecommendationStatusV1,
  CoachingExplanationV1,
  CoachingInputV1,
  CoachingRecommendationV1,
  DailyCoachingSeriesV1,
  DailyCoachingPointV1,
  DailyCoachingSeriesSummaryV1,
} from './types'
