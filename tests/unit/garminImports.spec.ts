import { describe, expect, it } from 'vitest'
import { loadGarminImportedWeights, loadGarminModifierRecords, loadGarminWorkoutSummaries, mergeGarminImportedData } from '../../src/utils/storage/garminImports'

describe('garmin import foundations', () => {
  it('keeps local same-date weight authoritative while storing ignored Garmin conflict metadata', () => {
    const result = mergeGarminImportedData({
      importedWeights: [
        {
          date: '2026-04-16',
          weight: 180,
          unit: 'lb',
          sourceUpdatedAt: '2026-04-16T07:00:00.000Z',
        },
      ],
      localWeights: [
        {
          id: 'local-weight',
          date: '2026-04-16',
          weight: 179.2,
          unit: 'lb',
          createdAt: '2026-04-16T08:00:00.000Z',
          updatedAt: '2026-04-16T08:00:00.000Z',
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(loadGarminImportedWeights()[0]).toMatchObject({
      state: 'ignored_conflict',
      conflictLocalWeightId: 'local-weight',
      date: '2026-04-16',
    })
  })

  it('stores modifier records separately from workout summaries', () => {
    const result = mergeGarminImportedData({
      modifierRecords: [
        {
          date: '2026-04-16',
          steps: 10234,
          sleepMinutes: 442,
          restingHeartRate: 51,
          activeCalories: 620,
          derivedCardioMinutes: 38,
          sourceUpdatedAt: '2026-04-16T07:00:00.000Z',
        },
      ],
      workoutSummaries: [
        {
          date: '2026-04-16',
          workoutName: 'Upper A',
          startedAt: '2026-04-16T06:10:00.000Z',
          durationMinutes: 58,
          activeCalories: 410,
          averageHeartRate: 132,
          sourceUpdatedAt: '2026-04-16T07:05:00.000Z',
        },
      ],
      localWeights: [],
    })

    expect(result.ok).toBe(true)
    expect(loadGarminModifierRecords()).toHaveLength(1)
    expect(loadGarminModifierRecords()[0]?.steps).toBe(10234)
    expect(loadGarminWorkoutSummaries()).toHaveLength(1)
    expect(loadGarminWorkoutSummaries()[0]?.workoutName).toBe('Upper A')
  })
})
