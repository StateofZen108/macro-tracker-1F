import { describe, expect, it } from 'vitest'
import { buildTrainingPreservationVerdict } from '../../src/domain/trainingPreservation'

describe('training preservation OS', () => {
  it('prioritizes strength preservation when anchor lifts, volume floor, or readiness leak', () => {
    expect(
      buildTrainingPreservationVerdict({
        anchorLiftChangePercent: -2.3,
        volumeFloorMet: false,
        readiness: 'red',
      }),
    ).toEqual({
      verdict: 'preserve_strength',
      reasonCodes: ['anchor_lift_down', 'volume_floor_missed', 'readiness_red'],
    })
  })

  it('holds the cut when training contract is intact and respects planned deloads', () => {
    expect(
      buildTrainingPreservationVerdict({
        anchorLiftChangePercent: 0.4,
        volumeFloorMet: true,
        readiness: 'green',
      }),
    ).toEqual({
      verdict: 'hold_cut',
      reasonCodes: ['training_contract_preserved'],
    })

    expect(
      buildTrainingPreservationVerdict({
        anchorLiftChangePercent: -4,
        volumeFloorMet: false,
        readiness: 'red',
        plannedDeload: true,
      }),
    ).toEqual({
      verdict: 'deload_supported',
      reasonCodes: ['planned_deload'],
    })
  })
})
