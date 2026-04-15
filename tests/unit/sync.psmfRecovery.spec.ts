import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/utils/storage/defaults'
import {
  applyRecordsToDataset,
  recordsToDataset,
  sortSyncRecordsForApply,
} from '../../src/utils/sync/shared'
import type { SyncRecordEnvelope } from '../../src/types'

describe('psmf and recovery sync round-trips', () => {
  it('applies activity before wellness for the same sync batch', () => {
    const records: SyncRecordEnvelope[] = [
      {
        scope: 'wellness',
        recordId: 'garmin:2026-04-12',
        payload: {
          date: '2026-04-12',
          provider: 'garmin',
          steps: 10420,
          sleepMinutes: 412,
          sourceUpdatedAt: '2026-04-12T07:00:00.000Z',
          updatedAt: '2026-04-12T07:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
      {
        scope: 'activity',
        recordId: '2026-04-12',
        payload: {
          date: '2026-04-12',
          steps: 7500,
          updatedAt: '2026-04-12T08:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
    ]

    const sorted = sortSyncRecordsForApply(records)
    expect(sorted.map((record) => record.scope)).toEqual(['activity', 'wellness'])
  })

  it('round-trips wellness, recovery, and phase records through sync application', () => {
    const records: SyncRecordEnvelope[] = [
      {
        scope: 'wellness',
        recordId: 'garmin:2026-04-12',
        payload: {
          date: '2026-04-12',
          provider: 'garmin',
          steps: 10420,
          sleepMinutes: 412,
          restingHeartRate: 58,
          stressScore: 21,
          bodyBatteryMax: 79,
          intensityMinutes: 48,
          derivedCardioMinutes: 42,
          sourceUpdatedAt: '2026-04-12T07:00:00.000Z',
          updatedAt: '2026-04-12T07:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
      {
        scope: 'recovery_check_ins',
        recordId: '2026-04-12',
        payload: {
          date: '2026-04-12',
          energyScore: 3,
          hungerScore: 4,
          sorenessScore: 2,
          sleepQualityScore: 3,
          notes: 'Felt flat but manageable',
          updatedAt: '2026-04-12T08:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
      {
        scope: 'diet_phases',
        recordId: 'phase-1',
        payload: {
          id: 'phase-1',
          type: 'psmf',
          status: 'active',
          startDate: '2026-04-10',
          plannedEndDate: '2026-04-24',
          calorieTargetOverride: 1300,
          notes: 'Aggressive cut block',
          createdAt: '2026-04-10T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
      {
        scope: 'diet_phase_events',
        recordId: 'phase-event-1',
        payload: {
          id: 'phase-event-1',
          phaseId: 'phase-1',
          type: 'refeed_day',
          date: '2026-04-14',
          calorieTargetOverride: 1700,
          notes: 'Planned refeed',
          createdAt: '2026-04-12T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
        serverVersion: 1,
        serverUpdatedAt: '2026-04-13T00:00:00.000Z',
      },
    ]

    const dataset = recordsToDataset(records, DEFAULT_SETTINGS)
    expect(dataset.wellness).toHaveLength(1)
    expect(dataset.recoveryCheckIns).toHaveLength(1)
    expect(dataset.dietPhases).toHaveLength(1)
    expect(dataset.dietPhaseEvents).toHaveLength(1)

    const removedPhase = applyRecordsToDataset(
      dataset,
      [
        {
          scope: 'diet_phases',
          recordId: 'phase-1',
          payload: {
            id: 'phase-1',
            type: 'psmf',
            status: 'cancelled',
            startDate: '2026-04-10',
            plannedEndDate: '2026-04-24',
            updatedAt: '2026-04-13T00:00:00.000Z',
          },
          deletedAt: '2026-04-13T00:00:00.000Z',
          serverVersion: 2,
          serverUpdatedAt: '2026-04-13T00:00:00.000Z',
        },
      ],
      DEFAULT_SETTINGS,
    )

    expect(removedPhase.dietPhases).toHaveLength(0)
  })
})
