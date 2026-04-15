import type {
  CoachingBlockedReasonCode,
  CoachingReasonCode,
  LegacyCoachingCode,
} from '../../types'

const BLOCKED_REASON_CODES = new Set<CoachingBlockedReasonCode>([
  'insufficient_eligible_days',
  'insufficient_weighins',
  'low_data_quality',
  'trend_unavailable',
  'explicit_day_confounder',
  'recent_import',
  'intervention_change',
  'recovery_issues',
  'travel',
  'illness',
  'high_calorie_event',
  'goal_mode_recently_changed',
  'fat_loss_mode_recently_changed',
  'eligible_days_low',
  'weighins_low',
  'explicit_days_low',
  'partial_logging_high',
  'unmarked_logging_high',
  'adherence_low',
  'protein_low',
  'step_adherence_low',
  'cardio_adherence_low',
  'psmf_phase_required',
  'psmf_phase_expired',
  'diet_break_active',
  'recovery_hold',
])

const REASON_CODES = new Set<CoachingReasonCode>([
  'insufficient_eligible_days',
  'insufficient_weighins',
  'low_data_quality',
  'trend_unavailable',
  'explicit_day_confounder',
  'recent_import',
  'intervention_change',
  'recovery_issues',
  'travel',
  'illness',
  'high_calorie_event',
  'goal_mode_recently_changed',
  'fat_loss_mode_recently_changed',
  'eligible_days_low',
  'weighins_low',
  'explicit_days_low',
  'partial_logging_high',
  'unmarked_logging_high',
  'adherence_low',
  'protein_low',
  'step_adherence_low',
  'cardio_adherence_low',
  'loss_faster_than_target',
  'loss_slower_than_target',
  'rate_on_target',
  'maintenance_on_target',
  'maintenance_weight_down',
  'maintenance_weight_up',
  'gain_faster_than_target',
  'gain_slower_than_target',
  'calorieFloorApplied',
  'personal_floor_applied',
  'psmf_no_further_decrease',
  'manual_override',
  'coach_override',
  'diet_break',
  'recovery_adjustment',
  'travel_reset',
  'adherence_reset',
  'recovery_watch',
  'refeed_scheduled',
  'diet_break_review_recommended',
])

export function toLegacyCoachingCode(rawCode: string): LegacyCoachingCode {
  return `legacy:${rawCode}`
}

export function normalizeBlockedReasonCode(
  rawCode: string | undefined,
): CoachingBlockedReasonCode | LegacyCoachingCode {
  if (!rawCode) {
    return toLegacyCoachingCode('unknown')
  }

  return BLOCKED_REASON_CODES.has(rawCode as CoachingBlockedReasonCode)
    ? (rawCode as CoachingBlockedReasonCode)
    : toLegacyCoachingCode(rawCode)
}

export function normalizeReasonCode(
  rawCode: string | undefined,
): CoachingReasonCode | LegacyCoachingCode {
  if (!rawCode) {
    return toLegacyCoachingCode('unknown')
  }

  return REASON_CODES.has(rawCode as CoachingReasonCode)
    ? (rawCode as CoachingReasonCode)
    : toLegacyCoachingCode(rawCode)
}
