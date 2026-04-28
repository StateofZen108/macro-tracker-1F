// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckInRecord } from '../../src/types'

async function resetStorage(): Promise<void> {
  window.localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('macrotracker-app')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

function buildStoredCheckIn(): CheckInRecord {
  return {
    id: 'checkin:2026-04-20',
    weekEndDate: '2026-04-20',
    weekStartDate: '2026-04-14',
    nextCheckInDate: '2026-04-27',
    priorWeekStartDate: '2026-04-07',
    priorWeekEndDate: '2026-04-13',
    goalMode: 'lose',
    targetWeeklyRatePercent: -0.75,
    actualWeeklyRatePercent: -0.12,
    avgCalories: 2400,
    avgProtein: 180,
    avgSteps: 9000,
    weeklyCardioMinutes: 140,
    stepAdherencePercent: 112,
    cardioAdherencePercent: 117,
    avgWeight: 200,
    priorAvgWeight: 200,
    recommendedStepDelta: 1500,
    recommendedStepTarget: 9500,
    recommendationReason: 'Prior clean slow week confirmed a stall.',
    recommendationExplanation: 'The previous proof window was clean and slow.',
    confidenceBand: 'high',
    confidenceScore: 92,
    decisionType: 'increase_steps',
    reviewVerdict: 'true_stall',
    reasonCodes: ['true_stall', 'step_lever_selected'],
    blockedReasons: [],
    dataQuality: {
      score: 96,
      band: 'high',
      eligibleDays: 7,
      weighInDays: 7,
      explicitEligibleDays: 7,
      completeDays: 7,
      partialDays: 0,
      fastingDays: 0,
      unmarkedLoggedDays: 0,
      markedConfounderDays: 0,
      recentlyImported: false,
      recoveryIssueCount: 0,
    },
    adherence: {
      isAdequate: true,
      calorieDeviationPercent: 0,
      proteinHitRate: 100,
      stepAdherencePercent: 112,
      cardioAdherencePercent: 117,
      reasons: [],
    },
    confounders: {
      reasons: [],
      explicitMarkers: [],
      hasRecentImport: false,
      hasInterventionChange: false,
      hasRecoveryIssues: false,
      hasPartialLogging: false,
      hasMissingWeighIns: false,
      hasTravel: false,
      hasIllness: false,
      hasHighCalorieEvent: false,
      highCalorieEventDays: 0,
    },
    status: 'ready',
    createdAt: '2026-04-20T09:00:00.000Z',
    updatedAt: '2026-04-20T09:00:00.000Z',
  }
}

beforeEach(async () => {
  vi.resetModules()
  await resetStorage()
})

describe('weekly check-in storage', () => {
  it('preserves coaching proof metadata when loading persisted check-in history', async () => {
    window.localStorage.setItem('mt_checkin_history', JSON.stringify([buildStoredCheckIn()]))

    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadCheckInHistory } = await import('../../src/utils/storage/checkIns')

    await initializeStorage()

    const [record] = loadCheckInHistory()
    expect(record?.dataQuality?.eligibleDays).toBe(7)
    expect(record?.adherence?.isAdequate).toBe(true)
    expect(record?.confounders?.highCalorieEventDays).toBe(0)
    expect(record?.updatedAt).toBe('2026-04-20T09:00:00.000Z')
  })
})
