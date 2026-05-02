import { classifyFoodTrustEvidence } from './foodTrust'
import type {
  FoodAccuracyIssue,
  FoodAuditActor,
  FoodAuditEvent,
  FoodAuditEventType,
  FoodLogEntry,
  FoodMacroSnapshot,
  FoodProofSummary,
  TrustRepairTask,
} from '../types'

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0
}

export function snapshotFoodLogEntry(entry: FoodLogEntry): FoodMacroSnapshot {
  return {
    entryId: entry.id,
    foodId: entry.foodId,
    date: entry.date,
    meal: entry.meal,
    servings: entry.servings,
    name: entry.snapshot.name,
    brand: entry.snapshot.brand,
    servingSize: entry.snapshot.servingSize,
    servingUnit: entry.snapshot.servingUnit,
    calories: round(entry.snapshot.calories * entry.servings),
    protein: round(entry.snapshot.protein * entry.servings),
    carbs: round(entry.snapshot.carbs * entry.servings),
    fat: round(entry.snapshot.fat * entry.servings),
    trustStatus: entry.snapshot.trustEvidence?.status,
    needsReview: entry.needsReview,
  }
}

function eventTypeForChange(before: FoodLogEntry | undefined, after: FoodLogEntry | undefined): FoodAuditEventType {
  if (!before && after) {
    return after.deletedAt ? 'deleted' : 'created'
  }

  if (before && !after) {
    return 'deleted'
  }

  if (before?.deletedAt && after && !after.deletedAt) {
    return 'restored'
  }

  if (!before?.deletedAt && after?.deletedAt) {
    return 'deleted'
  }

  return 'edited'
}

function issuesForEntry(entry: FoodLogEntry | undefined): FoodAccuracyIssue[] {
  if (!entry) {
    return []
  }

  const evidence = entry.snapshot.trustEvidence ?? classifyFoodTrustEvidence({ snapshot: entry.snapshot })
  return evidence.accuracyIssues ?? []
}

function buildEventId(input: {
  operationId: string
  entryId: string
  eventType: FoodAuditEventType
  createdAt: string
  before?: FoodMacroSnapshot
  after?: FoodMacroSnapshot
}): string {
  return `food-audit:${stableHash(JSON.stringify(input))}`
}

export function buildFoodAuditEvents(input: {
  date: string
  beforeEntries: FoodLogEntry[]
  afterEntries: FoodLogEntry[]
  actor: FoodAuditActor
  operationId: string
  createdAt?: string
}): FoodAuditEvent[] {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const beforeById = new Map(input.beforeEntries.map((entry) => [entry.id, entry]))
  const afterById = new Map(input.afterEntries.map((entry) => [entry.id, entry]))
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()
  const events: FoodAuditEvent[] = []

  for (const id of ids) {
    const beforeEntry = beforeById.get(id)
    const afterEntry = afterById.get(id)
    const before = beforeEntry ? snapshotFoodLogEntry(beforeEntry) : undefined
    const after = afterEntry ? snapshotFoodLogEntry(afterEntry) : undefined

    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue
    }

    const eventType = buildEventTypeOverride(input.actor, eventTypeForChange(beforeEntry, afterEntry))
    const eventInput = {
      operationId: input.operationId,
      entryId: id,
      eventType,
      createdAt,
      before,
      after,
    }

    events.push({
      id: buildEventId(eventInput),
      operationId: input.operationId,
      entryId: id,
      date: after?.date ?? before?.date ?? input.date,
      eventType,
      actor: input.actor,
      before,
      after,
      trustBefore: before?.trustStatus,
      trustAfter: after?.trustStatus,
      issues: issuesForEntry(afterEntry ?? beforeEntry),
      createdAt,
    })
  }

  return events
}

function buildEventTypeOverride(actor: FoodAuditActor, fallback: FoodAuditEventType): FoodAuditEventType {
  return actor === 'import' && fallback === 'created' ? 'imported' : fallback
}

export function buildFoodProofSummary(input: {
  date: string
  entries: FoodLogEntry[]
  trustRepairs?: TrustRepairTask[]
  auditEvents?: FoodAuditEvent[]
}): FoodProofSummary {
  const activeEntries = input.entries.filter((entry) => !entry.deletedAt)
  let caloriesTotal = 0
  let caloriesTrusted = 0
  let caloriesReviewRequired = 0
  let trustedEntryCount = 0
  let reviewRequiredEntryCount = 0
  let blockedEntryCount = 0

  for (const entry of activeEntries) {
    const calories = round(entry.snapshot.calories * entry.servings)
    caloriesTotal += calories
    const evidence = entry.snapshot.trustEvidence ?? classifyFoodTrustEvidence({ snapshot: entry.snapshot })
    if (evidence.status === 'trusted' && evidence.proofEligible !== false) {
      caloriesTrusted += calories
      trustedEntryCount += 1
    } else if (evidence.status === 'blocked') {
      caloriesReviewRequired += calories
      blockedEntryCount += 1
    } else {
      caloriesReviewRequired += calories
      reviewRequiredEntryCount += 1
    }
  }

  const repairTaskCount = input.trustRepairs?.filter((task) => task.status === 'open').length ?? 0

  return {
    date: input.date,
    caloriesTotal: round(caloriesTotal),
    caloriesTrusted: round(caloriesTrusted),
    caloriesReviewRequired: round(caloriesReviewRequired),
    trustedEntryCount,
    reviewRequiredEntryCount,
    blockedEntryCount,
    repairTaskCount,
    proofEligible: activeEntries.length > 0 && repairTaskCount === 0 && blockedEntryCount === 0 && reviewRequiredEntryCount === 0,
    auditEventCount: input.auditEvents?.filter((event) => event.date === input.date).length ?? 0,
  }
}

export function replayFoodAuditCalories(events: FoodAuditEvent[], date: string): number {
  const latestByEntry = new Map<string, FoodMacroSnapshot>()
  for (const event of [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (event.date !== date) {
      continue
    }

    if (event.eventType === 'deleted' || !event.after) {
      latestByEntry.delete(event.entryId)
      continue
    }

    latestByEntry.set(event.entryId, event.after)
  }

  return round([...latestByEntry.values()].reduce((sum, entry) => sum + entry.calories, 0))
}
