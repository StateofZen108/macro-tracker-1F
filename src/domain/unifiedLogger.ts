import type { LoggerMethod } from '../types'

export const UNIFIED_LOGGER_METHODS: LoggerMethod[] = [
  'search',
  'barcode',
  'label_ocr',
  'ai_photo',
  'quick_add',
  'custom',
  'recipe',
  'import',
]

export interface UnifiedLoggerSession {
  id: string
  meal: string
  date: string
  openedAt: number
  methods: LoggerMethod[]
}

export function createUnifiedLoggerSession(input: {
  meal: string
  date: string
  now?: number
  id?: string
}): UnifiedLoggerSession {
  return {
    id: input.id ?? `logger-${input.date}-${input.meal}-${input.now ?? Date.now()}`,
    meal: input.meal,
    date: input.date,
    openedAt: input.now ?? Date.now(),
    methods: UNIFIED_LOGGER_METHODS,
  }
}

export function canSwitchLoggerMethod(session: UnifiedLoggerSession, method: LoggerMethod): boolean {
  return session.methods.includes(method)
}
