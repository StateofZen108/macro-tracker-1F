/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('storage psmf and recovery round trips', () => {
  it(
    'exports and restores diet phases, recovery check-ins, and wellness entries',
    async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveDietPhases, loadDietPhases } = await import('../../src/utils/storage/dietPhases')
    const {
      saveDietPhaseEvents,
      loadDietPhaseEvents,
    } = await import('../../src/utils/storage/dietPhaseEvents')
    const {
      saveRecoveryCheckIns,
      loadRecoveryCheckIns,
    } = await import('../../src/utils/storage/recoveryCheckIns')
    const { saveWellnessEntries, loadWellnessEntries } = await import('../../src/utils/storage/wellness')
    const { exportBackupFile, applyBackupImport } = await import('../../src/utils/storage/importExport')

    await initializeStorage()

    const wellnessEntry = {
      date: '2026-04-12',
      provider: 'garmin' as const,
      steps: 10420,
      sleepMinutes: 412,
      restingHeartRate: 58,
      stressScore: 21,
      bodyBatteryMax: 79,
      intensityMinutes: 48,
      derivedCardioMinutes: 42,
      sourceUpdatedAt: '2026-04-12T07:00:00.000Z',
      updatedAt: '2026-04-12T07:00:00.000Z',
    }
    const recoveryCheckIn = {
      date: '2026-04-12',
      energyScore: 3 as const,
      hungerScore: 4 as const,
      sorenessScore: 2 as const,
      sleepQualityScore: 3 as const,
      notes: 'Felt flat but manageable',
      updatedAt: '2026-04-12T08:00:00.000Z',
    }
    const phase = {
      id: 'phase-1',
      type: 'psmf' as const,
      status: 'active' as const,
      startDate: '2026-04-10',
      plannedEndDate: '2026-04-24',
      calorieTargetOverride: 1300,
      notes: 'Aggressive cut block',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
    }
    const phaseEvent = {
      id: 'phase-event-1',
      phaseId: 'phase-1',
      type: 'refeed_day' as const,
      date: '2026-04-14',
      calorieTargetOverride: 1700,
      notes: 'Planned refeed',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
    }

    expect(saveWellnessEntries([wellnessEntry]).ok).toBe(true)
    expect(saveRecoveryCheckIns([recoveryCheckIn]).ok).toBe(true)
    expect(saveDietPhases([phase]).ok).toBe(true)
    expect(saveDietPhaseEvents([phaseEvent]).ok).toBe(true)

    const exported = exportBackupFile()
    expect(exported.ok).toBe(true)
    if (!exported.ok) {
      return
    }

    expect(exported.data.wellness).toHaveLength(1)
    expect(exported.data.recoveryCheckIns).toHaveLength(1)
    expect(exported.data.dietPhases).toHaveLength(1)
    expect(exported.data.dietPhaseEvents).toHaveLength(1)

    window.localStorage.clear()

    const restoreResult = applyBackupImport(exported.data, 'replace')
    expect(restoreResult.ok).toBe(true)

    expect(loadWellnessEntries()).toEqual([wellnessEntry])
    expect(loadRecoveryCheckIns()).toEqual([recoveryCheckIn])
    expect(loadDietPhases()).toEqual([phase])
    expect(loadDietPhaseEvents()).toEqual([phaseEvent])
    },
    15000,
  )

  it(
    'preserves soft-deleted refeed artifacts across export and restore while keeping them marked deleted',
    async () => {
      const { initializeStorage } = await import('../../src/utils/storage/schema')
      const { saveDietPhases } = await import('../../src/utils/storage/dietPhases')
      const {
        saveDietPhaseEvents,
        loadDietPhaseEvents,
      } = await import('../../src/utils/storage/dietPhaseEvents')
      const { exportBackupFile, applyBackupImport } = await import('../../src/utils/storage/importExport')

      await initializeStorage()

      expect(
        saveDietPhases([
          {
            id: 'phase-soft-delete',
            type: 'psmf',
            status: 'completed',
            startDate: '2026-04-01',
            plannedEndDate: '2026-04-14',
            actualEndDate: '2026-04-10',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
        ]).ok,
      ).toBe(true)
      expect(
        saveDietPhaseEvents([
          {
            id: 'phase-event-soft-delete',
            phaseId: 'phase-soft-delete',
            type: 'refeed_day',
            date: '2026-04-12',
            calorieTargetOverride: 1900,
            notes: 'Invalidated by early completion',
            createdAt: '2026-04-05T00:00:00.000Z',
            updatedAt: '2026-04-10T00:00:00.000Z',
            deletedAt: '2026-04-10T00:00:00.000Z',
          },
        ]).ok,
      ).toBe(true)

      const exported = exportBackupFile()
      expect(exported.ok).toBe(true)
      if (!exported.ok) {
        return
      }

      window.localStorage.clear()
      const restoreResult = applyBackupImport(exported.data, 'replace')
      expect(restoreResult.ok).toBe(true)

      expect(loadDietPhaseEvents()).toEqual([
        {
          id: 'phase-event-soft-delete',
          phaseId: 'phase-soft-delete',
          type: 'refeed_day',
          date: '2026-04-12',
          calorieTargetOverride: 1900,
          notes: 'Invalidated by early completion',
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-10T00:00:00.000Z',
          deletedAt: '2026-04-10T00:00:00.000Z',
        },
      ])
    },
    15000,
  )
})
