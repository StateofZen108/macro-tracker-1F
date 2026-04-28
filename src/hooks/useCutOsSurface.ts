import { useMemo, useSyncExternalStore } from 'react'
import { buildCutOsSetupChecklist, buildCutOsSnapshot } from '../domain/cutOs'
import { buildCutOsSurfaceModel } from '../domain/cutOsActions'
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

interface UseCutOsSurfaceInput {
  enabled: boolean
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  weights: WeightEntry[]
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

  return useMemo(() => {
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

    return buildCutOsSurfaceModel({
      snapshot,
      setup,
      actionHistory,
    })
  }, [actionHistory, input])
}
