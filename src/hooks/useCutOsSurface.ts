import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { buildCutOsSetupChecklist, buildCutOsSnapshot } from '../domain/cutOs'
import { buildCutOsSurfaceModel } from '../domain/cutOsActions'
import { buildDailyMistakeProofModel } from '../domain/dailyGuardrails'
import { buildCommandConsistencyReport, buildCommandSurfaceSnapshot } from '../domain/surfaceConsistency'
import type {
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingDecisionRecord,
  CutDayPlan,
  CutOsSurfaceModel,
  DietPhase,
  DietPhaseEvent,
  FoodLogEntry,
  FoodReviewItem,
  WeightEntry,
  WorkoutDashboardSnapshot,
} from '../types'
import {
  loadCutOsActions,
  subscribeToCutOsActions,
} from '../utils/storage/cutOsActions'
import { upsertDailyGuardrailModel } from '../utils/storage/dailyGuardrails'

interface UseCutOsSurfaceInput {
  enabled: boolean
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  weights: WeightEntry[]
  allWeights?: WeightEntry[]
  currentCheckIn: CheckInRecord | null
  checkInHistory?: CheckInRecord[]
  coachingDecisionHistory?: CoachingDecisionRecord[]
  bodyProgressSnapshots: BodyProgressSnapshot[]
  dietPhases: DietPhase[]
  dietPhaseEvents: DietPhaseEvent[]
  cutDayPlan?: CutDayPlan | null
  workoutSnapshot: WorkoutDashboardSnapshot
  foodReviewQueue: FoodReviewItem[]
}

export function useCutOsSurface(input: UseCutOsSurfaceInput): CutOsSurfaceModel | null {
  const actionHistory = useSyncExternalStore(
    subscribeToCutOsActions,
    loadCutOsActions,
    loadCutOsActions,
  )

  const surface = useMemo(() => {
    const snapshot = buildCutOsSnapshot(input)
    const setup = input.enabled
      ? buildCutOsSetupChecklist({
          date: input.date,
          logsByDate: input.logsByDate,
          weights: input.weights,
          workoutSnapshot: input.workoutSnapshot,
          foodReviewQueue: input.foodReviewQueue,
        })
      : []

    const baseSurface = buildCutOsSurfaceModel({
      snapshot,
      setup,
      actionHistory,
    })

    if (!baseSurface || !FEATURE_FLAGS.dailyGuardrailsV1) {
      return baseSurface
    }

    const surfaceConsistency = buildCommandConsistencyReport({
      surfaces: (['dashboard', 'log', 'weight', 'coach'] as const).map((surfaceName) =>
        buildCommandSurfaceSnapshot(surfaceName, baseSurface),
      ),
    })
    const dailyGuardrails = buildDailyMistakeProofModel({
      date: input.date,
      surface: baseSurface,
      entries: input.logsByDate[input.date] ?? [],
      foodReviewQueue: input.foodReviewQueue,
      weights: input.allWeights ?? input.weights,
      surfaceConsistency,
    })

    return {
      ...baseSurface,
      dailyGuardrails,
    }
  }, [actionHistory, input])

  useEffect(() => {
    if (!surface?.dailyGuardrails || !FEATURE_FLAGS.dailyGuardrailsV1) {
      return
    }

    void upsertDailyGuardrailModel(surface.dailyGuardrails)
  }, [surface?.dailyGuardrails])

  return surface
}
