/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '../../src/types'
import { partitionSettingsForSync, mergeSyncSettingsIntoLocal } from '../../src/utils/sync/shared'

async function resetStorage(): Promise<void> {
  window.localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('macrotracker-app')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe('coach wave 1 settings and sync', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    vi.resetModules()
    await resetStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T08:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('partitions and merges mode, floor, and stabilization runtime state', () => {
    const settings: UserSettings = {
      calorieTarget: 1900,
      proteinTarget: 180,
      carbTarget: 120,
      fatTarget: 45,
      weightUnit: 'kg',
      goalMode: 'lose',
      fatLossMode: 'psmf',
      coachingEnabled: true,
      checkInWeekday: 2,
      targetWeeklyRatePercent: -0.8,
      askCoachEnabled: true,
      shareInterventionsWithCoach: true,
      coachCitationsExpanded: true,
      coachingMinCalories: 900,
      tdeeEstimate: 1750,
      coachingDismissedAt: '2026-04-10T08:00:00.000Z',
      goalModeChangedAt: '2026-04-12T08:00:00.000Z',
      goalModeChangedFrom: 'maintain',
      fatLossModeChangedAt: '2026-04-18T08:00:00.000Z',
    }

    const partitioned = partitionSettingsForSync(settings, {
      settingsTargets: '2026-04-21T08:00:00.000Z',
      settingsPreferences: '2026-04-21T08:00:00.000Z',
      settingsCoachingRuntime: '2026-04-21T08:00:00.000Z',
    })
    const merged = mergeSyncSettingsIntoLocal(
      {
        ...settings,
        goalModeChangedAt: undefined,
        goalModeChangedFrom: undefined,
        fatLossMode: 'standard_cut',
        coachingMinCalories: undefined,
        fatLossModeChangedAt: undefined,
      },
      partitioned,
    )

    expect(partitioned.settingsTargets.fatLossMode).toBe('psmf')
    expect(partitioned.settingsPreferences.coachingMinCalories).toBe(900)
    expect(partitioned.settingsCoachingRuntime.goalModeChangedAt).toBe(
      '2026-04-12T08:00:00.000Z',
    )
    expect(partitioned.settingsCoachingRuntime.goalModeChangedFrom).toBe('maintain')
    expect(partitioned.settingsCoachingRuntime.fatLossModeChangedAt).toBe(
      '2026-04-18T08:00:00.000Z',
    )
    expect(merged.fatLossMode).toBe('psmf')
    expect(merged.coachingMinCalories).toBe(900)
    expect(merged.goalModeChangedAt).toBe('2026-04-12T08:00:00.000Z')
    expect(merged.goalModeChangedFrom).toBe('maintain')
    expect(merged.fatLossModeChangedAt).toBe('2026-04-18T08:00:00.000Z')
  })

  it('stamps fatLossModeChangedAt only when switching fat-loss modes inside lose mode', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadSettings, saveSettings } = await import('../../src/utils/storage/internal')

    vi.useRealTimers()
    await initializeStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T08:00:00.000Z'))

    const initial = loadSettings()
    const loseStandard = {
      ...initial,
      goalMode: 'lose' as const,
      fatLossMode: 'standard_cut' as const,
      calorieTarget: 2000,
      proteinTarget: 180,
      carbTarget: 200,
      fatTarget: 60,
      targetWeeklyRatePercent: -0.5,
    }
    expect(saveSettings(loseStandard).ok).toBe(true)

    vi.setSystemTime(new Date('2026-04-23T09:30:00.000Z'))
    expect(
      saveSettings({
        ...loseStandard,
        fatLossMode: 'psmf',
      }).ok,
    ).toBe(true)

    expect(loadSettings().fatLossModeChangedAt).toBe('2026-04-23T09:30:00.000Z')
  })

  it('stamps goalModeChangedAt and preserves fat-loss mode timestamp rules on goal mode changes', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadSettings, saveSettings } = await import('../../src/utils/storage/internal')

    vi.useRealTimers()
    await initializeStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T08:00:00.000Z'))

    const initial = loadSettings()
    expect(
      saveSettings({
        ...initial,
        goalMode: 'maintain',
        fatLossMode: 'standard_cut',
      }).ok,
    ).toBe(true)

    vi.setSystemTime(new Date('2026-04-24T10:00:00.000Z'))
    expect(
      saveSettings({
        ...loadSettings(),
        goalMode: 'lose',
        fatLossMode: 'psmf',
        calorieTarget: 1800,
        proteinTarget: 180,
        carbTarget: 120,
        fatTarget: 50,
        targetWeeklyRatePercent: -0.8,
      }).ok,
    ).toBe(true)

    expect(loadSettings().goalModeChangedAt).toBe('2026-04-24T10:00:00.000Z')
    expect(loadSettings().goalModeChangedFrom).toBe('maintain')
    expect(loadSettings().fatLossModeChangedAt).toBeUndefined()
  })

  it('stamps goalModeChangedAt with the previous goal mode when leaving lose', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadSettings, saveSettings } = await import('../../src/utils/storage/internal')

    vi.useRealTimers()
    await initializeStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T08:00:00.000Z'))

    expect(
      saveSettings({
        ...loadSettings(),
        goalMode: 'lose',
        fatLossMode: 'psmf',
        calorieTarget: 1800,
        proteinTarget: 180,
        carbTarget: 120,
        fatTarget: 50,
        targetWeeklyRatePercent: -0.8,
      }).ok,
    ).toBe(true)

    vi.setSystemTime(new Date('2026-04-25T07:15:00.000Z'))
    expect(
      saveSettings({
        ...loadSettings(),
        goalMode: 'maintain',
        targetWeeklyRatePercent: 0,
      }).ok,
    ).toBe(true)

    expect(loadSettings().goalModeChangedAt).toBe('2026-04-25T07:15:00.000Z')
    expect(loadSettings().goalModeChangedFrom).toBe('lose')
  })
})
