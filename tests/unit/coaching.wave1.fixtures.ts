import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserSettings } from '../../src/types'
import type { CoachingReplayFixture } from '../../src/domain/coaching/validation'
import type { CoachRuntimeState } from '../../src/domain/coaching/runtime'
import { buildSettings, buildWindowData } from './coaching.engine.fixtures'

export type Wave1FixtureTag =
  | 'under_logging'
  | 'confounded'
  | 'psmf_no_further_decrease'
  | 'recent_fat_loss_mode_switch'
  | 'recent_goal_mode_switch'
  | 'personal_floor'

export interface Wave1ReplayFixture extends CoachingReplayFixture {
  tags?: Wave1FixtureTag[]
}

function loseSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return buildSettings({
    goalMode: 'lose',
    fatLossMode: 'standard_cut',
    targetWeeklyRatePercent: -0.5,
    ...overrides,
  })
}

function maintenanceSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return buildSettings({
    goalMode: 'maintain',
    fatLossMode: 'standard_cut',
    targetWeeklyRatePercent: 0,
    ...overrides,
  })
}

function gainSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return buildSettings({
    goalMode: 'gain',
    fatLossMode: 'standard_cut',
    targetWeeklyRatePercent: 0.25,
    ...overrides,
  })
}

function buildPsmfRuntime(overrides: Partial<CoachRuntimeState> = {}): CoachRuntimeState {
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
      ...overrides.phasePlan,
    },
    recovery: {
      checkIns: [],
      wellness: [],
      ...overrides.recovery,
    },
  }
}

function psmfLoseSettings(
  overrides: Partial<UserSettings> = {},
  runtimeOverrides: Partial<CoachRuntimeState> = {},
): UserSettings {
  return {
    ...loseSettings({
      fatLossMode: 'psmf',
      ...overrides,
    }),
    coachRuntime: buildPsmfRuntime(runtimeOverrides),
  } as UserSettings
}

function fixture(
  id: string,
  settings: UserSettings,
  window: ReturnType<typeof buildWindowData>,
  expected: CoachingReplayFixture['expected'],
  cohort: CoachingReplayFixture['cohort'],
  tags?: Wave1FixtureTag[],
): Wave1ReplayFixture {
  return {
    id,
    cohort,
    tags,
    params: {
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
      interventions: [],
      recoveryIssueCount: 0,
    },
    expected,
  }
}

const keepWindowA = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.125,
})

const keepWindowB = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.12,
})

const slowerWindowA = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.05,
})

const slowerWindowB = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: () => 200,
})

const fasterWindowA = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.3,
})

const fasterWindowB = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.34,
})

const confoundedTravelWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  markers: {
    '2026-04-18': ['travel'],
  },
})

const underLoggingWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  statuses: {
    '2026-04-11': 'partial',
    '2026-04-12': 'partial',
    '2026-04-13': 'partial',
  },
})

const slowerWindowHighCalories = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 2400,
  weightForIndex: () => 200,
})

const personalFloorWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 1300,
  protein: 180,
  weightForIndex: () => 200,
})

const psmfFasterWindowB = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 1750,
  protein: 180,
  weightForIndex: (index) => 200 - index * 0.34,
})

const gainKeepWindowA = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 2600,
  protein: 180,
  weightForIndex: (index) => 200 + index * 0.07,
})

const gainSlowWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 2550,
  protein: 180,
  weightForIndex: (index) => 200 + index * 0.02,
})

const gainFastWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 2550,
  protein: 180,
  weightForIndex: (index) => 200 + index * 0.14,
})

const proteinLowPsmfWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  protein: 130,
  weightForIndex: (index) => 200 - index * 0.12,
})

const lowActivityPsmfWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  steps: 3500,
  cardioMinutes: 5,
  weightForIndex: (index) => 200 - index * 0.12,
})

const modeSwitchStandardWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.08,
})

const modeSwitchPsmfWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: (index) => 200 - index * 0.08,
})

const goalModeSwitchMaintainWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  weightForIndex: () => 200,
})

const goalModeSwitchGainWindow = buildWindowData({
  start: '2026-04-01',
  end: '2026-04-21',
  calories: 2550,
  protein: 180,
  weightForIndex: (index) => 200 + index * 0.05,
})

export const WAVE1_REPLAY_FIXTURES: Wave1ReplayFixture[] = [
  fixture(
    'fat-loss-standard-keep-a',
    loseSettings(),
    keepWindowA,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['rate_on_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-keep-b',
    loseSettings({ calorieTarget: 2100, carbTarget: 210 }),
    keepWindowB,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['rate_on_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-slower-a',
    loseSettings(),
    slowerWindowA,
    {
      decisionType: 'decrease_calories',
      reasonCodes: ['loss_slower_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-slower-b',
    loseSettings({ calorieTarget: 2400, carbTarget: 270, targetWeeklyRatePercent: -0.75 }),
    slowerWindowHighCalories,
    {
      decisionType: 'decrease_calories',
      reasonCodes: ['loss_slower_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-faster-a',
    loseSettings(),
    fasterWindowA,
    {
      decisionType: 'increase_calories',
      reasonCodes: ['loss_faster_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-faster-b',
    loseSettings({ calorieTarget: 2100, carbTarget: 210 }),
    fasterWindowB,
    {
      decisionType: 'increase_calories',
      reasonCodes: ['loss_faster_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-confounded-travel',
    loseSettings(),
    confoundedTravelWindow,
    {
      decisionType: 'ignore_period_due_to_confounders',
      blockedReasonCodes: ['travel'],
    },
    'fat_loss',
    ['confounded'],
  ),
  fixture(
    'fat-loss-standard-under-logging',
    loseSettings(),
    underLoggingWindow,
    {
      decisionType: 'hold_for_more_data',
    },
    'fat_loss',
    ['under_logging'],
  ),
  fixture(
    'fat-loss-standard-personal-floor',
    loseSettings({
      calorieTarget: 1300,
      proteinTarget: 180,
      carbTarget: 80,
      fatTarget: 40,
      coachingMinCalories: 1250,
      targetWeeklyRatePercent: -0.8,
    }),
    personalFloorWindow,
    {
      decisionType: 'decrease_calories',
      reasonCodes: ['loss_slower_than_target', 'personal_floor_applied'],
    },
    'fat_loss',
    ['personal_floor'],
  ),
  fixture(
    'fat-loss-psmf-keep-a',
    psmfLoseSettings(),
    keepWindowA,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['rate_on_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-psmf-slower-a',
    psmfLoseSettings(),
    slowerWindowA,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['psmf_no_further_decrease'],
    },
    'fat_loss',
    ['psmf_no_further_decrease'],
  ),
  fixture(
    'fat-loss-psmf-slower-b',
    psmfLoseSettings({ calorieTarget: 1850, carbTarget: 115 }),
    slowerWindowB,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['psmf_no_further_decrease'],
    },
    'fat_loss',
    ['psmf_no_further_decrease'],
  ),
  fixture(
    'fat-loss-psmf-faster-a',
    psmfLoseSettings(),
    fasterWindowA,
    {
      decisionType: 'increase_calories',
      reasonCodes: ['loss_faster_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-psmf-faster-b',
    psmfLoseSettings({ calorieTarget: 1750, carbTarget: 100 }),
    psmfFasterWindowB,
    {
      decisionType: 'increase_calories',
      reasonCodes: ['loss_faster_than_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-psmf-protein-low',
    psmfLoseSettings(),
    proteinLowPsmfWindow,
    {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['adherence_low', 'protein_low'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-psmf-low-activity-nonblocking',
    psmfLoseSettings({
      dailyStepTarget: 10000,
      weeklyCardioMinuteTarget: 150,
    }),
    lowActivityPsmfWindow,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['rate_on_target'],
    },
    'fat_loss',
  ),
  fixture(
    'fat-loss-standard-mode-switch-stabilization',
    loseSettings({
      fatLossMode: 'standard_cut',
      fatLossModeChangedAt: '2026-04-18T08:00:00.000Z',
    }),
    modeSwitchStandardWindow,
    {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['fat_loss_mode_recently_changed'],
    },
    'fat_loss',
    ['recent_fat_loss_mode_switch'],
  ),
  fixture(
    'fat-loss-psmf-mode-switch-stabilization',
    psmfLoseSettings({
      fatLossModeChangedAt: '2026-04-18T08:00:00.000Z',
    }),
    modeSwitchPsmfWindow,
    {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['fat_loss_mode_recently_changed'],
    },
    'fat_loss',
    ['recent_fat_loss_mode_switch'],
  ),
  fixture(
    'maintenance-keep-a',
    maintenanceSettings({ calorieTarget: 2200, carbTarget: 220 }),
    buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: () => 200,
    }),
    {
      decisionType: 'keep_targets',
      reasonCodes: ['maintenance_on_target'],
    },
    'maintenance',
  ),
  fixture(
    'maintenance-goal-mode-switch-stabilization',
    maintenanceSettings({
      calorieTarget: 2150,
      carbTarget: 210,
      goalModeChangedAt: '2026-04-19T08:00:00.000Z',
      goalModeChangedFrom: 'lose',
    }),
    goalModeSwitchMaintainWindow,
    {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['goal_mode_recently_changed'],
    },
    'maintenance',
    ['recent_goal_mode_switch'],
  ),
  fixture(
    'maintenance-weight-up',
    maintenanceSettings({ calorieTarget: 2200, carbTarget: 220 }),
    buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 + index * 0.08,
    }),
    {
      decisionType: 'decrease_calories',
      reasonCodes: ['maintenance_weight_up'],
    },
    'maintenance',
  ),
  fixture(
    'maintenance-weight-down',
    maintenanceSettings({ calorieTarget: 2200, carbTarget: 220 }),
    buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.08,
    }),
    {
      decisionType: 'increase_calories',
      reasonCodes: ['maintenance_weight_down'],
    },
    'maintenance',
  ),
  fixture(
    'maintenance-confounded',
    maintenanceSettings({ calorieTarget: 2200, carbTarget: 220 }),
    buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      markers: {
        '2026-04-19': ['illness'],
      },
      weightForIndex: () => 200,
    }),
    {
      decisionType: 'ignore_period_due_to_confounders',
    },
    'maintenance',
  ),
  fixture(
    'gain-keep-a',
    gainSettings({ calorieTarget: 2600, carbTarget: 300 }),
    gainKeepWindowA,
    {
      decisionType: 'keep_targets',
      reasonCodes: ['rate_on_target'],
    },
    'gain',
  ),
  fixture(
    'gain-goal-mode-switch-stabilization',
    gainSettings({
      calorieTarget: 2550,
      carbTarget: 285,
      goalModeChangedAt: '2026-04-20T08:00:00.000Z',
      goalModeChangedFrom: 'maintain',
    }),
    goalModeSwitchGainWindow,
    {
      decisionType: 'hold_for_more_data',
      blockedReasonCodes: ['goal_mode_recently_changed'],
    },
    'gain',
    ['recent_goal_mode_switch'],
  ),
  fixture(
    'gain-slower-than-target',
    gainSettings({ calorieTarget: 2550, carbTarget: 285 }),
    gainSlowWindow,
    {
      decisionType: 'increase_calories',
      reasonCodes: ['gain_slower_than_target'],
    },
    'gain',
  ),
  fixture(
    'gain-faster-than-target',
    gainSettings({ calorieTarget: 2550, carbTarget: 285 }),
    gainFastWindow,
    {
      decisionType: 'decrease_calories',
      reasonCodes: ['gain_faster_than_target'],
    },
    'gain',
  ),
  fixture(
    'gain-confounded',
    gainSettings({ calorieTarget: 2550, carbTarget: 285 }),
    buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      markers: {
        '2026-04-18': ['high_calorie_event'],
        '2026-04-19': ['high_calorie_event'],
      },
      weightForIndex: (index) => 200 + index * 0.05,
    }),
    {
      decisionType: 'ignore_period_due_to_confounders',
    },
    'gain',
  ),
]

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
)

export const WAVE1_BASELINE_PATH = path.join(fixturesDir, 'coaching-replay-baseline.json')
