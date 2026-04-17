import type { Food, FoodLogEntry, FoodReviewItem } from '../../types'

function cloneEntries(entries: FoodLogEntry[]): FoodLogEntry[] {
  return entries.map((entry) => ({ ...entry }))
}

function sortQueue(items: FoodReviewItem[]): FoodReviewItem[] {
  return [...items].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt),
  )
}

function buildOrphanedReviewItem(entry: FoodLogEntry): FoodReviewItem {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    status: 'pending',
    source: 'orphaned_log_entry',
    title: entry.snapshot.name,
    reason: 'The original food record is missing or archived and this entry must be relinked.',
    createdAt: now,
    updatedAt: now,
    linkedFoodId: entry.foodId,
    linkedEntryId: entry.id,
    linkedEntryDate: entry.date,
    barcode: entry.snapshot.barcode,
  }
}

export function reconcileFoodReviewQueue(params: {
  foods: Food[]
  logsByDate: Record<string, FoodLogEntry[]>
  queue: FoodReviewItem[]
}): {
  logsByDate: Record<string, FoodLogEntry[]>
  queue: FoodReviewItem[]
  changedDates: string[]
  createdReviewItemIds: string[]
  resolvedReviewItemIds: string[]
} {
  const activeFoodIds = new Set(params.foods.filter((food) => !food.archivedAt).map((food) => food.id))
  const nextLogsByDate = Object.fromEntries(
    Object.entries(params.logsByDate).map(([date, entries]) => [date, cloneEntries(entries)]),
  )
  const nextQueue = [...params.queue]
  const changedDates = new Set<string>()
  const createdReviewItemIds: string[] = []
  const resolvedReviewItemIds: string[] = []

  for (const [date, entries] of Object.entries(nextLogsByDate)) {
    for (const entry of entries) {
      if (entry.deletedAt) {
        continue
      }

      const hasActiveFood = entry.foodId ? activeFoodIds.has(entry.foodId) : false
      const linkedItem = entry.reviewItemId
        ? nextQueue.find((item) => item.id === entry.reviewItemId)
        : undefined
      const existingPendingItem = nextQueue.find(
        (item) =>
          item.status === 'pending' &&
          item.source === 'orphaned_log_entry' &&
          item.linkedEntryId === entry.id,
      )

      if (entry.foodId && !hasActiveFood) {
        const reviewItem =
          existingPendingItem && existingPendingItem.status === 'pending'
            ? existingPendingItem
            : buildOrphanedReviewItem(entry)

        if (!existingPendingItem) {
          nextQueue.push(reviewItem)
          createdReviewItemIds.push(reviewItem.id)
        }

        if (entry.reviewItemId !== reviewItem.id || entry.needsReview !== true) {
          entry.reviewItemId = reviewItem.id
          entry.needsReview = true
          changedDates.add(date)
        }

        continue
      }

      if (
        linkedItem &&
        linkedItem.source === 'orphaned_log_entry' &&
        linkedItem.status === 'pending' &&
        (!entry.foodId || hasActiveFood)
      ) {
        const now = new Date().toISOString()
        const index = nextQueue.findIndex((item) => item.id === linkedItem.id)
        if (index >= 0) {
          nextQueue[index] = {
            ...nextQueue[index]!,
            status: 'resolved',
            resolvedFoodId: entry.foodId,
            resolvedAt: now,
            updatedAt: now,
          }
          resolvedReviewItemIds.push(linkedItem.id)
        }
      }

      if (entry.reviewItemId || entry.needsReview) {
        entry.reviewItemId = undefined
        entry.needsReview = undefined
        changedDates.add(date)
      }
    }
  }

  return {
    logsByDate: nextLogsByDate,
    queue: sortQueue(nextQueue),
    changedDates: [...changedDates].sort(),
    createdReviewItemIds,
    resolvedReviewItemIds,
  }
}
