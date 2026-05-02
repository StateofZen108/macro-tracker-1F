import { AlertCircle, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FoodTrustEvidence, ResolvedFoodLogEntry, TrustRepairTask } from '../types'

interface FoodLogItemProps {
  entry: ResolvedFoodLogEntry
  onEdit: () => void
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  onDelete: () => void
  trustRepair?: TrustRepairTask
}

const SWIPE_WIDTH = 88
const SWIPE_THRESHOLD = 44

function formatMacros(entry: ResolvedFoodLogEntry): string {
  return `${Math.round(entry.nutrition.calories)} cal  •  ${Math.round(entry.nutrition.protein)}P  •  ${Math.round(entry.nutrition.carbs)}C  •  ${Math.round(entry.nutrition.fat)}F`
}

function formatTrustRepair(task: TrustRepairTask): string {
  switch (task.reasonCode) {
    case 'missing_macros':
      return 'Missing macros'
    case 'missing_serving_basis':
      return 'Serving basis needs review'
    case 'provider_conflict':
      return 'Provider conflict'
    case 'low_confidence':
      return 'Low confidence'
    case 'unreviewed_ai':
      return 'AI result needs review'
    case 'impossible_value':
      return 'Impossible value'
    default:
      return 'Needs review'
  }
}

function getTrustEvidence(entry: ResolvedFoodLogEntry): FoodTrustEvidence {
  return (
    entry.snapshot.trustEvidence ?? {
      source: entry.snapshot.barcode ? 'barcode' : 'custom',
      sourceId: entry.foodId ?? entry.id,
      status: entry.needsReview ? 'review_required' : 'trusted',
      confidence: entry.needsReview ? 0.5 : 0.85,
      servingBasis:
        entry.snapshot.servingSize > 0 && entry.snapshot.servingUnit.trim() ? 'verified' : 'missing',
      macroCompleteness: 'complete',
      providerConflict: false,
      reasons: entry.needsReview ? ['estimated_serving'] : [],
      proofEligible: !entry.needsReview,
    }
  )
}

function getTrustLabel(evidence: FoodTrustEvidence): string {
  if (evidence.status === 'trusted') {
    return 'Trusted'
  }

  return evidence.status === 'blocked' ? 'Blocked' : 'Review'
}

function getTrustDetail(evidence: FoodTrustEvidence): string {
  const blockingIssue = evidence.accuracyIssues?.find((issue) => issue.blocksCoachingProof)
  if (blockingIssue) {
    return blockingIssue.message
  }

  if (evidence.status === 'trusted') {
    return evidence.reviewedAt ? 'Reviewed and coaching-grade' : 'Complete macros and serving basis'
  }

  if (evidence.status === 'blocked') {
    return 'Blocked from coaching proof'
  }

  return 'Review before coaching use'
}

export function FoodLogItem({
  entry,
  onEdit,
  onDecreaseServings,
  onIncreaseServings,
  onDelete,
  trustRepair,
}: FoodLogItemProps) {
  const touchState = useRef<{
    startX: number
    startY: number
    startOffset: number
    locked: 'horizontal' | 'vertical' | null
  } | null>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)

  const servingLabel = `${entry.servings} x ${entry.snapshot.servingSize}${entry.snapshot.servingUnit}`
  const trustEvidence = getTrustEvidence(entry)
  const trustTone =
    trustEvidence.status === 'trusted'
      ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200'
      : trustEvidence.status === 'blocked'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'

  function resetSwipe(): void {
    setIsRevealed(false)
    setTranslateX(0)
  }

  return (
    <div
      data-entry-id={entry.id}
      className="relative overflow-hidden rounded-[24px]"
      style={{
        scrollMarginTop: '34rem',
        scrollMarginBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 7.5rem))',
      }}
    >
      <div className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center">
        <button
          type="button"
          className="flex h-full w-full items-center justify-center rounded-[24px] bg-rose-600 text-white transition hover:bg-rose-500"
          onClick={() => {
            resetSwipe()
            onDelete()
          }}
          aria-label={`Delete ${entry.snapshot.name}`}
          data-swipe-ignore="true"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div
        className="rounded-[24px] border border-black/5 bg-white/70 p-3 shadow-sm transition-transform dark:border-white/10 dark:bg-slate-900/70"
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('[data-swipe-ignore="true"]')) {
            touchState.current = null
            return
          }

          touchState.current = {
            startX: event.changedTouches[0]?.clientX ?? 0,
            startY: event.changedTouches[0]?.clientY ?? 0,
            startOffset: isRevealed ? -SWIPE_WIDTH : 0,
            locked: null,
          }
        }}
        onTouchMove={(event) => {
          if (!touchState.current) {
            return
          }

          const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchState.current.startX
          const deltaY = (event.changedTouches[0]?.clientY ?? 0) - touchState.current.startY

          if (!touchState.current.locked) {
            if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
              touchState.current.locked = 'vertical'
            } else if (Math.abs(deltaX) > 10) {
              touchState.current.locked = 'horizontal'
            }
          }

          if (touchState.current.locked !== 'horizontal') {
            return
          }

          const nextOffset = Math.max(
            -SWIPE_WIDTH,
            Math.min(0, touchState.current.startOffset + deltaX),
          )

          setTranslateX(nextOffset)
        }}
        onTouchEnd={() => {
          if (!touchState.current) {
            return
          }

          const shouldReveal = translateX <= -SWIPE_THRESHOLD
          setIsRevealed(shouldReveal)
          setTranslateX(shouldReveal ? -SWIPE_WIDTH : 0)
          touchState.current = null
        }}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => {
              if (isRevealed) {
                resetSwipe()
                return
              }

              onEdit()
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{entry.snapshot.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  {entry.snapshot.brand ? `${entry.snapshot.brand} • ` : ''}
                  {servingLabel}
                </p>
                {trustRepair ? (
                  <p
                    data-testid="trust-repair-chip"
                    className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    {formatTrustRepair(trustRepair)}
                  </p>
                ) : entry.needsReview ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Needs review
                  </p>
                ) : null}
                <p
                  data-testid="food-trust-status"
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trustTone}`}
                  title={getTrustDetail(trustEvidence)}
                >
                  {getTrustLabel(trustEvidence)}
                </p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              {formatMacros(entry)}
            </p>
          </button>
          <div className="flex items-center gap-1" data-swipe-ignore="true">
            <button
              type="button"
              className="icon-button"
              onClick={onDecreaseServings}
              aria-label={`Decrease ${entry.snapshot.name} servings`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="min-w-[3.5rem] rounded-2xl bg-slate-100 px-2 py-2 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {entry.servings}x
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onIncreaseServings}
              aria-label={`Increase ${entry.snapshot.name} servings`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
