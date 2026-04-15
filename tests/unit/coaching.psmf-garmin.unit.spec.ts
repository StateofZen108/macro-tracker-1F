import { describe, expect, it } from 'vitest'
import { evaluateCoachEngineV2 } from '../../src/domain/coaching/engine'
import { buildSettings, buildWindowData } from './coaching.engine.fixtures'
import type { UserSettings } from '../../src/types'
import type { CoachPhaseRecord, CoachRuntimeState } from '../../src/domain/coaching/runtime'

function buildRuntimeSettings(
  overrides: Partial<UserSettings>,
  runtime: CoachRuntimeState,
): UserSettings {
  return {
    ...buildSettings(overrides),
    coachRuntime: runtime,
  } as UserSettings
}

function buildRecoveryRuntime(startDate: string): CoachRuntimeState {
  const phases: CoachPhaseRecord[] = [
    {
      type: 'psmf',
      status: 'active',
      startDate: '2026-04-01',
      plannedEndDate: '2026-04-30',
    },
  ]
  const wellness = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    return {
      date: dateKey,
      sleepMinutes: 480,
      restingHeartRate: 60,
      stressScore: 20,
      bodyBatteryMax: 80,
    }
  })
  const checkIns = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    return {
      date: dateKey,
      energyScore: 2,
      hungerScore: 2,
      sorenessScore: 2,
      sleepQualityScore: 2,
    }
  })

  return {
    phasePlan: {
      phases,
      refeeds: [{ date: '2026-04-18', calorieTargetOverride: 2450 }],
    },
    recovery: {
      wellness,
      checkIns,
    },
  }
}

describe('coaching engine PSMF and recovery runtime', () => {
  it('holds when PSMF mode has no active phase', () => {
    const settings = buildRuntimeSettings(
      { fatLossMode: 'psmf' },
      {
        phasePlan: {
          phases: [],
          refeeds: [],
        },
      },
    )
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.05,
    })

    const evaluation = evaluateCoachEngineV2({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('hold_for_more_data')
    expect(evaluation.recommendation.blockedReasons.map((reason) => reason.code)).toContain(
      'psmf_phase_required',
    )
  })

  it('keeps targets when a diet break is active', () => {
    const settings = buildRuntimeSettings(
      { fatLossMode: 'psmf' },
      {
        phasePlan: {
          phases: [
            {
              type: 'diet_break',
              status: 'active',
              startDate: '2026-04-15',
              plannedEndDate: '2026-04-21',
            },
          ],
          refeeds: [],
        },
      },
    )
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.08,
    })

    const evaluation = evaluateCoachEngineV2({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('keep_targets')
    expect(evaluation.recommendation.blockedReasons.map((reason) => reason.code)).toContain(
      'diet_break_active',
    )
    expect(evaluation.policy.recommendedCalories).toBe(settings.calorieTarget)
  })

  it('appends refeed_scheduled when a planned refeed falls inside the active PSMF window', () => {
    const settings = buildRuntimeSettings(
      { fatLossMode: 'psmf' },
      {
        phasePlan: {
          phases: [
            {
              type: 'psmf',
              status: 'active',
              startDate: '2026-04-01',
              plannedEndDate: '2026-04-30',
            },
          ],
          refeeds: [{ date: '2026-04-18', calorieTargetOverride: 2450 }],
        },
      },
    )
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.05,
    })

    const evaluation = evaluateCoachEngineV2({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('keep_targets')
    expect(evaluation.recommendation.reasonCodes).toContain('refeed_scheduled')
    expect(evaluation.recommendation.reasonCodes).toContain('psmf_no_further_decrease')
  })

  it('lowers confidence and appends recovery_watch on yellow recovery days', () => {
    const runtime = buildRecoveryRuntime('2026-03-25')
    runtime.recovery!.wellness = runtime.recovery!.wellness!.map((entry, index) => {
      if (index === runtime.recovery!.wellness!.length - 1) {
        return {
          ...entry,
          sleepMinutes: 420,
          restingHeartRate: 64,
          stressScore: 28,
          bodyBatteryMax: 65,
        }
      }

      return entry
    })
    runtime.recovery!.checkIns = runtime.recovery!.checkIns!.map((entry, index) => {
      if (index === runtime.recovery!.checkIns!.length - 1) {
        return {
          ...entry,
          energyScore: 3,
          hungerScore: 3,
          sorenessScore: 3,
          sleepQualityScore: 3,
        }
      }

    return entry
  })

  const settings = buildRuntimeSettings({ fatLossMode: 'psmf' }, runtime)
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.125,
    })

    const evaluation = evaluateCoachEngineV2({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.quality.runtime.recovery.latestSeverity).toBe('yellow')
    expect(evaluation.recommendation.reasonCodes).toContain('recovery_watch')
    expect(['medium', 'low', 'none']).toContain(evaluation.recommendation.confidenceBand)
  })

  it('holds after red recovery days on 2 of the last 3 days', () => {
    const runtime = buildRecoveryRuntime('2026-03-25')
    runtime.recovery!.wellness = runtime.recovery!.wellness!.map((entry, index) => {
      if (index >= runtime.recovery!.wellness!.length - 3 && index !== runtime.recovery!.wellness!.length - 1) {
        return {
          ...entry,
          sleepMinutes: 300,
          restingHeartRate: 70,
          stressScore: 40,
          bodyBatteryMax: 20,
        }
      }

      return entry
    })
    runtime.recovery!.checkIns = runtime.recovery!.checkIns!.map((entry, index) => {
      if (index >= runtime.recovery!.checkIns!.length - 3 && index !== runtime.recovery!.checkIns!.length - 1) {
        return {
          ...entry,
          energyScore: 4,
          hungerScore: 4,
          sorenessScore: 4,
          sleepQualityScore: 4,
        }
      }

      return entry
    })

    const settings = buildRuntimeSettings({ fatLossMode: 'psmf' }, runtime)
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.125,
    })

    const evaluation = evaluateCoachEngineV2({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('hold_for_more_data')
    expect(evaluation.recommendation.blockedReasons.map((reason) => reason.code)).toContain(
      'recovery_hold',
    )
  })
})
