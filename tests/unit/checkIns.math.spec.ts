import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateCheckInWeek, getLatestCompletedWeekEnd } from '../../src/domain/checkIns/math'
import type { ActivityEntry, DayMeta, FoodLogEntry, UserSettings, WeightEntry } from '../../src/types'
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
})
