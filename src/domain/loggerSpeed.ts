import type { LoggerSpeedMetric } from '../types'

export interface LoggerSpeedGateResult {
  passed: boolean
  failures: string[]
}

const METHOD_LIMITS: Partial<Record<LoggerSpeedMetric['method'], { seconds: number; taps: number }>> = {
  search: { seconds: 7, taps: 3 },
  barcode: { seconds: 20, taps: 4 },
  label_ocr: { seconds: 30, taps: 5 },
  custom: { seconds: 25, taps: 5 },
}

export function evaluateLoggerSpeedGate(metrics: LoggerSpeedMetric[]): LoggerSpeedGateResult {
  const failures: string[] = []

  for (const metric of metrics) {
    const limits = METHOD_LIMITS[metric.method]
    if (!limits) {
      continue
    }

    if (metric.successRate < 0.95) {
      failures.push(`${metric.method} success rate ${metric.successRate} is below 0.95`)
    }

    if (metric.medianSeconds > limits.seconds) {
      failures.push(`${metric.method} median ${metric.medianSeconds}s exceeds ${limits.seconds}s`)
    }

    if (metric.tapsMedian > limits.taps) {
      failures.push(`${metric.method} median taps ${metric.tapsMedian} exceeds ${limits.taps}`)
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

export function buildLoggerSpeedMetric(input: {
  method: LoggerSpeedMetric['method']
  durationsSeconds: number[]
  tapCounts: number[]
  successes: number
  attempts: number
}): LoggerSpeedMetric {
  const sortedDurations = [...input.durationsSeconds].sort((a, b) => a - b)
  const sortedTaps = [...input.tapCounts].sort((a, b) => a - b)
  const medianIndex = Math.max(0, Math.floor((sortedDurations.length - 1) / 2))
  const p90Index = Math.max(0, Math.ceil(sortedDurations.length * 0.9) - 1)

  return {
    method: input.method,
    medianSeconds: sortedDurations[medianIndex] ?? 0,
    p90Seconds: sortedDurations[p90Index] ?? 0,
    tapsMedian: sortedTaps[medianIndex] ?? 0,
    successRate: input.attempts > 0 ? input.successes / input.attempts : 0,
  }
}
