import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/utils/storage/settings'
import { isSyncedDatasetEffectivelyEmpty } from '../../src/utils/sync/localState'
import { partitionSettingsForSync, type SyncedLocalDataset } from '../../src/utils/sync/shared'

const ZERO_TIMESTAMP = new Date(0).toISOString()

function buildDataset(overrides: Partial<SyncedLocalDataset> = {}): SyncedLocalDataset {
  const defaultSettings = partitionSettingsForSync(DEFAULT_SETTINGS, {
    settingsTargets: ZERO_TIMESTAMP,
    settingsPreferences: ZERO_TIMESTAMP,
    settingsCoachingRuntime: ZERO_TIMESTAMP,
  })

  return {
    foods: [],
    foodLogEntries: [],
    weights: [],
    dayMeta: [],
    activity: [],
    wellness: [],
    recoveryCheckIns: [],
    dietPhases: [],
    dietPhaseEvents: [],
    interventions: [],
    mealTemplates: [],
    recipes: [],
    favoriteFoods: [],
    weeklyCheckIns: [],
    coachDecisions: [],
    settingsTargets: defaultSettings.settingsTargets,
    settingsPreferences: defaultSettings.settingsPreferences,
    settingsCoachingRuntime: defaultSettings.settingsCoachingRuntime,
    ...overrides,
  }
}

describe('sync dataset emptiness', () => {
  it('treats a fully empty synced dataset as empty', () => {
    expect(isSyncedDatasetEffectivelyEmpty(buildDataset())).toBe(true)
  })

  it('treats settings-only changes as local data', () => {
    const changedSettings = partitionSettingsForSync(
      {
        ...DEFAULT_SETTINGS,
        dailyStepTarget: 8000,
      },
      {
        settingsTargets: ZERO_TIMESTAMP,
        settingsPreferences: '2026-04-15T10:00:00.000Z',
        settingsCoachingRuntime: ZERO_TIMESTAMP,
      },
    )

    expect(
      isSyncedDatasetEffectivelyEmpty(
        buildDataset({
          settingsTargets: changedSettings.settingsTargets,
          settingsPreferences: changedSettings.settingsPreferences,
          settingsCoachingRuntime: changedSettings.settingsCoachingRuntime,
        }),
      ),
    ).toBe(false)
  })

  it('ignores default synced settings when no collection data exists', () => {
    const defaultSettingsWithFreshTimestamps = partitionSettingsForSync(DEFAULT_SETTINGS, {
      settingsTargets: '2026-04-15T10:00:00.000Z',
      settingsPreferences: '2026-04-15T10:00:00.000Z',
      settingsCoachingRuntime: '2026-04-15T10:00:00.000Z',
    })

    expect(
      isSyncedDatasetEffectivelyEmpty(
        buildDataset({
          settingsTargets: defaultSettingsWithFreshTimestamps.settingsTargets,
          settingsPreferences: defaultSettingsWithFreshTimestamps.settingsPreferences,
          settingsCoachingRuntime: defaultSettingsWithFreshTimestamps.settingsCoachingRuntime,
        }),
      ),
    ).toBe(true)
  })

  it('treats any synced collection record as data', () => {
    expect(
      isSyncedDatasetEffectivelyEmpty(
        buildDataset({
          foods: [
            {
              id: 'food-1',
              name: 'Cloud oats',
              servingSize: 40,
              servingUnit: 'g',
              calories: 150,
              protein: 5,
              carbs: 27,
              fat: 3,
              source: 'custom',
              usageCount: 0,
              createdAt: '2026-04-15T10:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe(false)
  })
})
