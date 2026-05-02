import { buildFoodAuditEvents } from '../../domain/foodAudit'
import type { ActionResult, FoodAuditActor, FoodLogEntry } from '../../types'
import { appendFoodAuditEvents } from './foodAudit'

export function recordFoodLogAuditEvent(input: {
  date: string
  beforeEntries: FoodLogEntry[]
  afterEntries: FoodLogEntry[]
  actor?: FoodAuditActor
  operationId?: string
  createdAt?: string
}): ActionResult<void> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return appendFoodAuditEvents(
    buildFoodAuditEvents({
      date: input.date,
      beforeEntries: input.beforeEntries,
      afterEntries: input.afterEntries,
      actor: input.actor ?? 'user',
      operationId: input.operationId ?? `log-save:${input.date}:${createdAt}`,
      createdAt,
    }),
  )
}
