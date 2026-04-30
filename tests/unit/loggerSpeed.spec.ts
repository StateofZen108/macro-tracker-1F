import { describe, expect, it } from 'vitest'
import { buildLoggerSpeedMetric, evaluateLoggerSpeedGate } from '../../src/domain/loggerSpeed'

describe('logger speed gate', () => {
  it('passes common, packaged, label, AI-photo, and custom logging budgets', () => {
    const metrics = [
      buildLoggerSpeedMetric({
        method: 'search',
        durationsSeconds: [5, 6, 7],
        tapCounts: [2, 3, 3],
        successes: 3,
        attempts: 3,
      }),
      buildLoggerSpeedMetric({
        method: 'barcode',
        durationsSeconds: [14, 18, 20],
        tapCounts: [3, 4, 4],
        successes: 20,
        attempts: 20,
      }),
      buildLoggerSpeedMetric({
        method: 'label_ocr',
        durationsSeconds: [24, 28, 30],
        tapCounts: [4, 5, 5],
        successes: 19,
        attempts: 20,
      }),
      buildLoggerSpeedMetric({
        method: 'ai_photo',
        durationsSeconds: [32, 41, 45],
        tapCounts: [4, 5, 5],
        successes: 19,
        attempts: 20,
      }),
      buildLoggerSpeedMetric({
        method: 'custom',
        durationsSeconds: [18, 22, 25],
        tapCounts: [4, 5, 5],
        successes: 20,
        attempts: 20,
      }),
    ]

    expect(evaluateLoggerSpeedGate(metrics)).toEqual({ passed: true, failures: [] })
  })

  it('fails when a logging path is slower or less reliable than the paid benchmark', () => {
    const result = evaluateLoggerSpeedGate([
      buildLoggerSpeedMetric({
        method: 'search',
        durationsSeconds: [8, 9, 10],
        tapCounts: [4, 4, 5],
        successes: 18,
        attempts: 20,
      }),
    ])

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual([
      'search success rate 0.9 is below 0.95',
      'search median 9s exceeds 7s',
      'search median taps 4 exceeds 3',
    ])
  })
})
