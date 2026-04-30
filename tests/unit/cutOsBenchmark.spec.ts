import { describe, expect, it } from 'vitest'
import { buildCutOsValidationBenchmark, evaluateCutOsBenchmark } from '../../src/domain/cutOsBenchmark'
import type { CutOsHistoricalReplayReport } from '../../src/types'

function replay(overrides: Partial<CutOsHistoricalReplayReport> = {}): CutOsHistoricalReplayReport {
  return {
    buildId: 'cut-os-v1',
    checkedAt: '2026-04-30T00:00:00.000Z',
    replayWindow: { start: '2026-04-01', end: '2026-04-30' },
    reconstructedDays: 30,
    trueStallsDetected: 2,
    expectedSpikesSuppressed: 3,
    trainingLeaksPrioritized: 1,
    foodTrustBlocksCaught: 4,
    falseEscalations: 0,
    missedActionableDays: 0,
    ...overrides,
  }
}

describe('Cut OS benchmark', () => {
  it('passes when historical replay proves stall, spike, and training precedence behavior', () => {
    const benchmark = buildCutOsValidationBenchmark({ replay: replay(), engineVersion: 'engine-2026-04-30' })

    expect(benchmark.targetEngineVersion).toBe('engine-2026-04-30')
    expect(benchmark.strengthLossAvoidanceSignals).toBe(1)
    expect(evaluateCutOsBenchmark(benchmark)).toEqual({ passed: true, failures: [] })
  })

  it('fails on false escalations or missing historical validation coverage', () => {
    const benchmark = buildCutOsValidationBenchmark({
      replay: replay({
        trueStallsDetected: 0,
        expectedSpikesSuppressed: 0,
        trainingLeaksPrioritized: 0,
        falseEscalations: 1,
      }),
    })

    expect(evaluateCutOsBenchmark(benchmark)).toEqual({
      passed: false,
      failures: [
        'false escalations 1 must be 0',
        'at least one true stall fixture must be detected',
        'at least one expected spike fixture must be suppressed',
        'at least one training leak fixture must be prioritized',
      ],
    })
  })
})
