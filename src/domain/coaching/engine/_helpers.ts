import { addDays, enumerateDateKeys, parseDateKey } from '../../../utils/dates'

export function roundTo(value: number, digits = 0): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  const sortedValues = [...values].sort((left, right) => left - right)
  const middleIndex = Math.floor(sortedValues.length / 2)
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
  }

  return sortedValues[middleIndex]
}

export function compareDateKeys(left: string, right: string): number {
  return parseDateKey(left).getTime() - parseDateKey(right).getTime()
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDateKeys(date, start) >= 0 && compareDateKeys(date, end) <= 0
}

export function buildWindowDates(windowEnd: string, windowDays: number): {
  windowStart: string
  dates: string[]
} {
  const windowStart = addDays(windowEnd, -(windowDays - 1))
  return {
    windowStart,
    dates: enumerateDateKeys(windowStart, windowEnd),
  }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function dayDiff(start: string, end: string): number {
  return Math.max(1, Math.round((parseDateKey(end).getTime() - parseDateKey(start).getTime()) / 86400000))
}
