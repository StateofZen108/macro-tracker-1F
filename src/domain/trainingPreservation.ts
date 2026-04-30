export type TrainingPreservationVerdict =
  | 'preserve_strength'
  | 'hold_cut'
  | 'deload_supported'
  | 'insufficient_training_data'

export interface TrainingPreservationInput {
  anchorLiftChangePercent?: number
  volumeFloorMet?: boolean
  readiness?: 'green' | 'yellow' | 'red'
  plannedDeload?: boolean
}

export function buildTrainingPreservationVerdict(input: TrainingPreservationInput): {
  verdict: TrainingPreservationVerdict
  reasonCodes: string[]
} {
  if (
    typeof input.anchorLiftChangePercent !== 'number' ||
    typeof input.volumeFloorMet !== 'boolean' ||
    !input.readiness
  ) {
    return {
      verdict: 'insufficient_training_data',
      reasonCodes: ['missing_training_contract'],
    }
  }

  if (input.plannedDeload) {
    return {
      verdict: 'deload_supported',
      reasonCodes: ['planned_deload'],
    }
  }

  const leaking =
    input.anchorLiftChangePercent <= -2 ||
    input.volumeFloorMet === false ||
    input.readiness === 'red'

  if (leaking) {
    return {
      verdict: 'preserve_strength',
      reasonCodes: [
        input.anchorLiftChangePercent <= -2 ? 'anchor_lift_down' : '',
        input.volumeFloorMet === false ? 'volume_floor_missed' : '',
        input.readiness === 'red' ? 'readiness_red' : '',
      ].filter(Boolean),
    }
  }

  return {
    verdict: 'hold_cut',
    reasonCodes: ['training_contract_preserved'],
  }
}
