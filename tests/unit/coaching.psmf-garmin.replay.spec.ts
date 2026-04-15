import { describe, expect, it } from 'vitest'
import { evaluateCoachEngineV2 } from '../../src/domain/coaching/engine'
import { runCoachingReplaySuite, type CoachingReplayFixture } from '../../src/domain/coaching/validation'
import { buildSettings, buildWindowData } from './coaching.engine.fixtures'
import type { UserSettings } from '../../src/types'
import type { CoachRuntimeState } from '../../src/domain/coaching/runtime'

function buildRuntimeSettings(
  overrides: Partial<UserSettings>,
  runtime: CoachRuntimeState,
): UserSettings {
  return {
    ...buildSettings(overrides),
    coachRuntime: runtime,
  } as UserSettings
}

function buildActivePsmfRuntime(withRefeed = false): CoachRuntimeState {
  return {
    phasePlan: {
      phases: [
        {
          type: 'psmf',
          status: 'active',
          startDate: '2026-04-01',
          plannedEndDate: '2026-04-30',
        },
      ],
      refeeds: withRefeed ? [{ date: '2026-04-18', calorieTargetOverride: 2450 }] : [],
    },
    recovery: {
      checkIns: [],
      wellness: [],
    },
  }
}

function buildRecoveryRuntime(kind: 'yellow' | 'red'): CoachRuntimeState {
  const wellness = Array.from({ length: 28 }, (_, index) => {
    const date = new Date('2026-03-25T00:00:00.000Z')
    date.setUTCDate(date.getUTCDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    const isLatest = index === 27
    const isRecentRed = kind === 'red' && index >= 25 && index < 27

    return {
      date: dateKey,
      sleepMinutes: isRecentRed ? 300 : isLatest && kind === 'yellow' ? 420 : 480,
      restingHeartRate: isRecentRed ? 70 : isLatest && kind === 'yellow' ? 64 : 60,
      stressScore: isRecentRed ? 40 : isLatest && kind === 'yellow' ? 28 : 20,
      bodyBatteryMax: isRecentRed ? 20 : isLatest && kind === 'yellow' ? 65 : 80,
    }
  })
  const checkIns = Array.from({ length: 28 }, (_, index) => {
    const date = new Date('2026-03-25T00:00:00.000Z')
    date.setUTCDate(date.getUTCDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    const isLatest = index === 27
    const isRecentRed = kind === 'red' && index >= 25 && index < 27

    return {
      date: dateKey,
      energyScore: isRecentRed ? 4 : isLatest && kind === 'yellow' ? 3 : 2,
      hungerScore: isRecentRed ? 4 : isLatest && kind === 'yellow' ? 3 : 2,
      sorenessScore: isRecentRed ? 4 : isLatest && kind === 'yellow' ? 3 : 2,
      sleepQualityScore: isRecentRed ? 4 : isLatest && kind === 'yellow' ? 3 : 2,
    }
  })

  return {
    phasePlan: {
      phases: [
        {
          type: 'psmf',
          status: 'active',
          startDate: '2026-04-01',
          plannedEndDate: '2026-04-30',
        },
      ],
      refeeds: [],
    },
    recovery: {
      wellness,
      checkIns,
    },
  }
}

const replayFixtures: CoachingReplayFixture[] = [
  {
    id: 'psmf-phase-required',
    cohort: 'fat_loss',
    params: {
      windowEnd: '2026-04-21',
      settings: buildRuntimeSettings(
        { fatLossMode: 'psmf' },
        { phasePlan: { phases: [], refeeds: [] }, recovery: { checkIns: [], wellness: [] } },
      ),
      logsByDate: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).logsByDate,
      dayMeta: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).dayMeta,
      weights: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).weights,
      activityLog: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).activityLog,
      interventions: [],
      recoveryIssueCount: 0,
    },
    expected: {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['psmf_phase_required'],
    },
  },
  {
    id: 'diet-break-active',
    cohort: 'fat_loss',
    params: {
      windowEnd: '2026-04-21',
      settings: buildRuntimeSettings(
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
          recovery: { checkIns: [], wellness: [] },
        },
      ),
      logsByDate: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.08,
      }).logsByDate,
      dayMeta: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.08,
      }).dayMeta,
      weights: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.08,
      }).weights,
      activityLog: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.08,
      }).activityLog,
      interventions: [],
      recoveryIssueCount: 0,
    },
    expected: {
      decisionType: 'keep_targets',
      blockedReasonCodes: ['diet_break_active'],
    },
  },
  {
    id: 'psmf-refeed-scheduled',
    cohort: 'fat_loss',
    params: {
      windowEnd: '2026-04-21',
      settings: buildRuntimeSettings({ fatLossMode: 'psmf' }, buildActivePsmfRuntime(true)),
      logsByDate: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).logsByDate,
      dayMeta: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).dayMeta,
      weights: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).weights,
      activityLog: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).activityLog,
      interventions: [],
      recoveryIssueCount: 0,
    },
    expected: {
      decisionType: 'keep_targets',
      reasonCodes: ['psmf_no_further_decrease', 'refeed_scheduled'],
    },
  },
  {
    id: 'recovery-hold',
    cohort: 'fat_loss',
    params: {
      windowEnd: '2026-04-21',
      settings: buildRuntimeSettings({ fatLossMode: 'psmf' }, buildRecoveryRuntime('red')),
      logsByDate: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).logsByDate,
      dayMeta: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).dayMeta,
      weights: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).weights,
      activityLog: buildWindowData({
        start: '2026-04-01',
        end: '2026-04-21',
        weightForIndex: (index) => 200 - index * 0.05,
      }).activityLog,
      interventions: [],
      recoveryIssueCount: 0,
    },
    expected: {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['recovery_hold'],
    },
  },
]

describe('coach PSMF and Garmin replay coverage', () => {
  it('matches the locked PSMF and recovery outcomes', () => {
    const { results, metrics } = runCoachingReplaySuite(replayFixtures, evaluateCoachEngineV2)

    expect(results).toHaveLength(4)
    expect(metrics.decisionMatchRate).toBe(100)
    expect(metrics.blockedReasonMatchRate).toBe(100)
    expect(results.find((result) => result.fixtureId === 'psmf-refeed-scheduled')?.actualReasonCodes).toContain(
      'refeed_scheduled',
    )
    expect(results.find((result) => result.fixtureId === 'recovery-hold')?.actualBlockedReasonCodes).toContain(
      'recovery_hold',
    )
    expect(
      results.find((result) => result.fixtureId === 'recovery-hold')?.evaluation.recommendation.blockedReasons.some(
        (reason) => reason.code === 'recovery_hold',
      ),
    ).toBe(true)
  })
})
