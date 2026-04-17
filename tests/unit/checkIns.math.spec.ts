import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateCheckInWeek,
  getLatestCompletedWeekEnd,
  isCheckInWindowActiveForDate,
  upsertCheckInRecord,
} from '../../src/domain/checkIns/math'
import type { ActivityEntry, CheckInRecord, DayMeta, FoodLogEntry, UserSettings, WeightEntry } from '../../src/types'
import { addDays, enumerateDateKeys } from '../../src/utils/dates'

const settings: UserSettings = {
  calorieTarget: 2000,
  proteinTarget: 180,
  carbTarget: 200,
  fatTarget: 60,
  weightUnit: 'lb',
  goalMode: 'lose',
  coachingEnabled: true,
  checkInWeekday: 1,
  targetWeeklyRatePercent: -0.5,
  askCoachEnabled: true,
  shareInterventionsWithCoach: true,
  coachCitationsExpanded: true,
}

function makeLog(date: string): FoodLogEntry {
  return {
    id: `log-${date}`,
    date,
    meal: 'breakfast',
    servings: 1,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    snapshot: {
      name: 'Prep meal',
      servingSize: 1,
      servingUnit: 'entry',
      calories: 2000,
      protein: 180,
      carbs: 200,
      fat: 60,
      source: 'custom',
    },
  }
}

describe('check-in math', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recommends lowering calories when the observed loss is slower than target', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const activity: ActivityEntry[] = []
    const weights: WeightEntry[] = []

    const weekEnd = getLatestCompletedWeekEnd('2026-04-11', settings.checkInWeekday)
    const currentWeek = enumerateDateKeys(addDays(weekEnd, -6), weekEnd)
    const priorWeek = enumerateDateKeys(addDays(weekEnd, -13), addDays(weekEnd, -7))
    const extraDays = enumerateDateKeys(addDays(weekEnd, -20), addDays(weekEnd, -18))

    for (const date of [...currentWeek, ...priorWeek, ...extraDays]) {
      logsByDate[date] = [makeLog(date)]
      dayMeta.push({ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` })
    }

    currentWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `cw-${index}`,
        date,
        weight: 199,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    currentWeek.forEach((date) => {
      activity.push({ date, steps: 9000, cardioMinutes: 20, updatedAt: `${date}T10:00:00.000Z` })
    })

    priorWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `pw-${index}`,
        date,
        weight: 200,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    extraDays.slice(0, 2).forEach((date, index) => {
      weights.push({
        id: `ew-${index}`,
        date,
        weight: 200.2,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })

    const result = evaluateCheckInWeek(settings, weights, logsByDate, dayMeta, activity, [], 0)
    expect(result.record.status).toBe('ready')
    expect(result.record.decisionType).toBe('decrease_calories')
    expect(result.canApplyTargets).toBe(true)
    expect(result.record.recommendationReason).toMatch(/slower than target/i)
  })

  it('builds a structured weekly packet with an energy snapshot and evidence cards', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const activity: ActivityEntry[] = []
    const weights: WeightEntry[] = []

    const weekEnd = getLatestCompletedWeekEnd('2026-04-11', settings.checkInWeekday)
    const currentWeek = enumerateDateKeys(addDays(weekEnd, -6), weekEnd)
    const priorWeek = enumerateDateKeys(addDays(weekEnd, -13), addDays(weekEnd, -7))
    const extraDays = enumerateDateKeys(addDays(weekEnd, -20), addDays(weekEnd, -18))

    for (const date of [...currentWeek, ...priorWeek, ...extraDays]) {
      logsByDate[date] = [makeLog(date)]
      dayMeta.push({ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` })
    }

    currentWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `cw-v3-${index}`,
        date,
        weight: 199,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    priorWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `pw-v3-${index}`,
        date,
        weight: 200,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    extraDays.slice(0, 2).forEach((date, index) => {
      weights.push({
        id: `ew-v3-${index}`,
        date,
        weight: 200.2,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    currentWeek.forEach((date) => {
      activity.push({ date, steps: 9000, cardioMinutes: 20, updatedAt: `${date}T10:00:00.000Z` })
    })

    const result = evaluateCheckInWeek(settings, weights, logsByDate, dayMeta, activity, [], 0)
    expect(result.record.weeklyCheckInPacket).toBeDefined()
    expect(result.record.weeklyCheckInPacket?.energyModel.averageLoggedCalories).toBe(
      result.record.avgCalories,
    )
    expect(result.record.weeklyCheckInPacket?.previousTargets.calorieTarget).toBe(
      settings.calorieTarget,
    )
    expect(result.record.weeklyCheckInPacket?.evidenceCards.length).toBeGreaterThanOrEqual(4)
  })

  it('blocks calorie changes when activity adherence is below target', () => {
    const lowActivitySettings: UserSettings = { ...settings, dailyStepTarget: 10000 }
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const activity: ActivityEntry[] = []
    const weights: WeightEntry[] = []

    const weekEnd = getLatestCompletedWeekEnd('2026-04-11', lowActivitySettings.checkInWeekday)
    const currentWeek = enumerateDateKeys(addDays(weekEnd, -6), weekEnd)
    const priorWeek = enumerateDateKeys(addDays(weekEnd, -13), addDays(weekEnd, -7))
    const extraDays = enumerateDateKeys(addDays(weekEnd, -20), addDays(weekEnd, -18))

    for (const date of [...currentWeek, ...priorWeek, ...extraDays]) {
      logsByDate[date] = [makeLog(date)]
      dayMeta.push({ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` })
    }

    currentWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `cw-${index}`,
        date,
        weight: 199.6,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    currentWeek.forEach((date) => {
      activity.push({ date, steps: 7000, cardioMinutes: 20, updatedAt: `${date}T10:00:00.000Z` })
    })

    priorWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `pw-${index}`,
        date,
        weight: 200,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    extraDays.slice(0, 2).forEach((date, index) => {
      weights.push({
        id: `ew-${index}`,
        date,
        weight: 200.2,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })

    const result = evaluateCheckInWeek(lowActivitySettings, weights, logsByDate, dayMeta, activity, [], 0)
    expect(result.record.status).toBe('insufficientData')
    expect(result.record.decisionType).toBe('hold_for_more_data')
    expect(result.record.recommendationReason).toMatch(/improve adherence/i)
    expect(result.canApplyTargets).toBe(false)
  })

  it('defers the weekly decision when marked confounders invalidate the window', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const activity: ActivityEntry[] = []
    const weights: WeightEntry[] = []

    const weekEnd = getLatestCompletedWeekEnd('2026-04-11', settings.checkInWeekday)
    const currentWeek = enumerateDateKeys(addDays(weekEnd, -6), weekEnd)
    const priorWeek = enumerateDateKeys(addDays(weekEnd, -13), addDays(weekEnd, -7))
    const extraDays = enumerateDateKeys(addDays(weekEnd, -20), addDays(weekEnd, -18))

    for (const date of [...currentWeek, ...priorWeek, ...extraDays]) {
      logsByDate[date] = [makeLog(date)]
      dayMeta.push({
        date,
        status: 'complete',
        markers: date === currentWeek[5] ? ['travel'] : undefined,
        updatedAt: `${date}T09:00:00.000Z`,
      })
    }

    currentWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `cw-${index}`,
        date,
        weight: 199.3,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    priorWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `pw-${index}`,
        date,
        weight: 200,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    extraDays.slice(0, 2).forEach((date, index) => {
      weights.push({
        id: `ew-${index}`,
        date,
        weight: 200.2,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    currentWeek.forEach((date) => {
      activity.push({ date, steps: 9000, cardioMinutes: 20, updatedAt: `${date}T10:00:00.000Z` })
    })

    const result = evaluateCheckInWeek(settings, weights, logsByDate, dayMeta, activity, [], 0)
    expect(result.record.status).toBe('deferred')
    expect(result.record.decisionType).toBe('ignore_period_due_to_confounders')
    expect(result.record.blockedReasons?.map((reason) => reason.code)).toContain(
      'explicit_day_confounder',
    )
    expect(result.canApplyTargets).toBe(false)
  })

  it('does not churn updatedAt when the computed record is logically unchanged', () => {
    const existingRecord: CheckInRecord = {
      id: 'checkin:2026-04-06',
      weekEndDate: '2026-04-06',
      weekStartDate: '2026-03-31',
      priorWeekStartDate: '2026-03-24',
      priorWeekEndDate: '2026-03-30',
      goalMode: 'lose',
      targetWeeklyRatePercent: -0.5,
      actualWeeklyRatePercent: -0.35,
      avgCalories: 2000,
      avgProtein: 180,
      avgSteps: 9000,
      weeklyCardioMinutes: 120,
      stepAdherencePercent: 90,
      cardioAdherencePercent: 100,
      avgWeight: 198.4,
      priorAvgWeight: 199.1,
      recommendedCalorieDelta: -100,
      recommendedCalorieTarget: 1900,
      recommendedMacroTargets: { protein: 180, carbs: 180, fat: 60 },
      recommendationReason: 'Loss was slower than target.',
      recommendationExplanation: 'Keep adherence strong and tighten calories slightly.',
      confidenceBand: 'high',
      confidenceScore: 86,
      decisionType: 'decrease_calories',
      reasonCodes: ['slower_than_target'],
      blockedReasons: [],
      dataQuality: {
        score: 92,
        band: 'high',
        eligibleDays: 21,
        weighInDays: 14,
        explicitEligibleDays: 21,
        completeDays: 21,
        partialDays: 0,
        fastingDays: 0,
        unmarkedLoggedDays: 0,
        markedConfounderDays: 0,
        recentlyImported: false,
        recoveryIssueCount: 0,
      },
      adherence: {
        isAdequate: true,
        calorieDeviationPercent: 2,
        proteinHitRate: 90,
        stepAdherencePercent: 90,
        cardioAdherencePercent: 100,
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
      decisionRecordId: 'engine_v1:2026-03-17:2026-04-06',
      status: 'ready',
      createdAt: '2026-04-06T09:00:00.000Z',
      updatedAt: '2026-04-06T09:00:00.000Z',
    }

    const nextRecord: CheckInRecord = {
      ...existingRecord,
      createdAt: '2026-04-13T09:00:00.000Z',
      updatedAt: '2026-04-13T09:00:00.000Z',
    }

    expect(upsertCheckInRecord([existingRecord], nextRecord)).toEqual([existingRecord])
  })

  it('uses Garmin wellness fallback for steps and cardio when no local activity log exists', () => {
    const weekEnd = getLatestCompletedWeekEnd('2026-04-11', settings.checkInWeekday)
    const currentWeek = enumerateDateKeys(addDays(weekEnd, -6), weekEnd)
    const priorWeek = enumerateDateKeys(addDays(weekEnd, -13), addDays(weekEnd, -7))
    const extraDays = enumerateDateKeys(addDays(weekEnd, -20), addDays(weekEnd, -18))
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const weights: WeightEntry[] = []

    for (const date of [...currentWeek, ...priorWeek, ...extraDays]) {
      logsByDate[date] = [makeLog(date)]
      dayMeta.push({ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` })
    }

    currentWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `cw-fallback-${index}`,
        date,
        weight: 199.4,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })
    priorWeek.slice(0, 4).forEach((date, index) => {
      weights.push({
        id: `pw-fallback-${index}`,
        date,
        weight: 200,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    })

    const coachingSettings = {
      ...settings,
      coachRuntime: {
        recovery: {
          wellness: currentWeek.map((date) => ({
            date,
            steps: 9100,
            derivedCardioMinutes: 18,
          })),
        },
      },
    } as UserSettings

    const result = evaluateCheckInWeek(
      coachingSettings,
      weights,
      logsByDate,
      dayMeta,
      [],
      [],
      0,
    )

    expect(result.record.avgSteps).toBe(9100)
    expect(result.record.weeklyCardioMinutes).toBe(126)
    expect(result.record.nextCheckInDate).toBe(addDays(weekEnd, 7))
    expect(isCheckInWindowActiveForDate(result.record, addDays(weekEnd, 5))).toBe(true)
    expect(result.record.weeklyCheckInPacket?.garminModifierWindow?.importedDays).toBe(7)
    expect(result.record.weeklyCheckInPacket?.evidenceCards.some((card) => card.id === 'garmin_modifier_window')).toBe(true)
  })
})
