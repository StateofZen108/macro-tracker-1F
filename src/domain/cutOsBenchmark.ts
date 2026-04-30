import type { CutOsHistoricalReplayReport, CutOsValidationBenchmark } from '../types'

export function buildCutOsValidationBenchmark(input: {
  replay: CutOsHistoricalReplayReport
  engineVersion?: string
}): CutOsValidationBenchmark {
  return {
    replayWindow: input.replay.replayWindow,
    targetEngineVersion: input.engineVersion ?? input.replay.buildId,
    trueStallsDetected: input.replay.trueStallsDetected,
    falseEscalations: input.replay.falseEscalations,
    expectedSpikesSuppressed: input.replay.expectedSpikesSuppressed,
    trainingLeaksPrioritized: input.replay.trainingLeaksPrioritized,
    strengthLossAvoidanceSignals: input.replay.trainingLeaksPrioritized,
  }
}

export function evaluateCutOsBenchmark(input: CutOsValidationBenchmark): {
  passed: boolean
  failures: string[]
} {
  const failures: string[] = []

  if (input.falseEscalations > 0) {
    failures.push(`false escalations ${input.falseEscalations} must be 0`)
  }

  if (input.trueStallsDetected < 1) {
    failures.push('at least one true stall fixture must be detected')
  }

  if (input.expectedSpikesSuppressed < 1) {
    failures.push('at least one expected spike fixture must be suppressed')
  }

  if (input.trainingLeaksPrioritized < 1) {
    failures.push('at least one training leak fixture must be prioritized')
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}
