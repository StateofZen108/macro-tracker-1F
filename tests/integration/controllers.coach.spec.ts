/** @vitest-environment jsdom */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCoachController } from '../../src/app/useCoachController'
import type { CoachContextSnapshot, CoachProviderConfig, UserSettings, UiPrefs } from '../../src/types'

const settings: UserSettings = {
  calorieTarget: 2200,
  proteinTarget: 180,
  carbTarget: 220,
  fatTarget: 60,
  weightUnit: 'lb',
  goalMode: 'maintain',
  coachingEnabled: true,
  checkInWeekday: 1,
  targetWeeklyRatePercent: 0,
  askCoachEnabled: true,
  shareInterventionsWithCoach: true,
  coachCitationsExpanded: true,
}

const uiPrefs: UiPrefs = {
  keepOpenAfterAdd: true,
  preferredAskCoachMode: 'standard',
  coachCitationsExpanded: true,
  coachAutoSendQueuedWhenOnline: false,
}

describe('useCoachController', () => {
  it('queues a question with a built snapshot and updates provider scaffold', () => {
    const queueQuestion = vi.fn(() => ({ ok: true as const, data: { id: 'queued', question: 'Why?', mode: 'standard', createdAt: '2026-04-11T10:00:00.000Z' } }))
    const updateCoachConfig = vi.fn(() => ({ ok: true as const, data: undefined }))
    const buildSnapshot = vi.fn((snapshot: CoachContextSnapshot) => snapshot)

    const { result } = renderHook(() =>
      useCoachController({
        selectedDate: '2026-04-11',
        selectedDayStatus: 'complete',
        selectedDateTotals: { calories: 2000, protein: 180, carbs: 200, fat: 60 },
        settings,
        uiPrefs,
        weights: [],
        interventions: [],
        coachingInsight: {
          confidence: 'medium',
          confidenceBand: 'medium',
          confidenceScore: 60,
          goalMode: 'maintain',
          isReady: false,
          reason: 'Trend guidance only',
          explanation: 'Reason',
          avgDailyCalories: 2000,
          avgDailyProtein: 180,
          estimatedTdee: 2200,
          recommendedCalories: null,
          allDayRecommendedCalories: null,
          eatingDayRecommendedCalories: null,
          weightChange: 0,
          weightChangeUnit: 'lb',
          adherenceTone: 'neutral',
          windowDays: 21,
          weighInDays: 10,
          intakeDays: 18,
          completeDays: 18,
          partialDays: 0,
          fastingDays: 0,
          unmarkedLoggedDays: 0,
          eligibleDays: 18,
          confounders: [],
          calibrationPhase: 'collecting',
          calibratedConfidencePercent: null,
        },
        logsByDate: {},
        getDayStatus: () => 'complete',
        buildSnapshot,
        queueQuestion,
        updateUiPrefs: vi.fn(() => ({ ok: true as const, data: undefined })),
        updateSettings: vi.fn(() => ({ ok: true as const, data: undefined })),
        updateCoachConfig,
        coachConfig: { provider: 'none', autoSendQueuedWhenOnline: false } as CoachProviderConfig,
        reportError: vi.fn(),
        requestTabChange: vi.fn(),
        openCopyPrevious: vi.fn(),
        openInterventionSheet: vi.fn(),
        onDismissCoaching: vi.fn(),
        onChangeDayStatus: vi.fn(),
        onApplyCoachingRecommendation: vi.fn(),
        networkStatus: 'online',
      }),
    )

    act(() => {
      result.current.handleCoachQuestion('Why?', 'standard')
    })

    expect(queueQuestion).toHaveBeenCalled()
    expect(buildSnapshot).toHaveBeenCalled()

    act(() => {
      result.current.handleSetProvider('gemini')
    })

    expect(updateCoachConfig).toHaveBeenCalled()
  })
})
