import { ShieldCheck } from 'lucide-react'
import type { FoodAuditEvent, FoodLogEntry, FoodProofSummary, TrustRepairTask } from '../../types'

interface FoodProofPanelProps {
  date: string
  entries: FoodLogEntry[]
  trustRepairs?: TrustRepairTask[]
}

function formatCalories(value: number): string {
  return `${Math.round(value)} cal`
}

function readFoodAuditEventCount(date: string): number {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem('mt_food_audit_events') ?? '[]') as unknown
    return Array.isArray(parsed)
      ? parsed.filter((event): event is FoodAuditEvent => {
          return typeof event === 'object' && event !== null && !Array.isArray(event) && (event as { date?: unknown }).date === date
        }).length
      : 0
  } catch {
    return 0
  }
}

function buildFoodProofSummary(input: FoodProofPanelProps): FoodProofSummary {
  const activeEntries = input.entries.filter((entry) => !entry.deletedAt)
  let caloriesTotal = 0
  let caloriesTrusted = 0
  let caloriesReviewRequired = 0
  let trustedEntryCount = 0
  let reviewRequiredEntryCount = 0
  let blockedEntryCount = 0

  for (const entry of activeEntries) {
    const calories = Number.isFinite(entry.snapshot.calories) ? entry.snapshot.calories * entry.servings : 0
    caloriesTotal += calories
    const status = entry.snapshot.trustEvidence?.status ?? (entry.needsReview ? 'review_required' : 'trusted')
    const proofEligible = entry.snapshot.trustEvidence?.proofEligible !== false && status === 'trusted'

    if (proofEligible) {
      caloriesTrusted += calories
      trustedEntryCount += 1
    } else {
      caloriesReviewRequired += calories
      if (status === 'blocked') {
        blockedEntryCount += 1
      } else {
        reviewRequiredEntryCount += 1
      }
    }
  }

  const repairTaskCount = input.trustRepairs?.filter((task) => task.status === 'open').length ?? 0

  return {
    date: input.date,
    caloriesTotal,
    caloriesTrusted,
    caloriesReviewRequired,
    trustedEntryCount,
    reviewRequiredEntryCount,
    blockedEntryCount,
    repairTaskCount,
    proofEligible: activeEntries.length > 0 && repairTaskCount === 0 && blockedEntryCount === 0 && reviewRequiredEntryCount === 0,
    auditEventCount: readFoodAuditEventCount(input.date),
  }
}

export function FoodProofPanel(props: FoodProofPanelProps) {
  const summary = buildFoodProofSummary(props)
  const reviewCount = summary.reviewRequiredEntryCount + summary.blockedEntryCount

  return (
    <section
      data-testid="food-proof-panel"
      className="rounded-[20px] border border-black/5 bg-white/75 px-3 py-3 text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/75 dark:text-white"
      aria-label="Food proof"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-teal-100 p-2 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Food proof
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {summary.proofEligible ? 'Coaching-grade logging' : 'Review needed before coaching proof'}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                summary.proofEligible
                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
              }`}
            >
              {summary.trustedEntryCount}/{summary.trustedEntryCount + reviewCount} trusted
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-2xl bg-slate-100 px-2 py-2 dark:bg-slate-800">
              <span className="block text-slate-500 dark:text-slate-400">Total</span>
              <strong>{formatCalories(summary.caloriesTotal)}</strong>
            </div>
            <div className="rounded-2xl bg-slate-100 px-2 py-2 dark:bg-slate-800">
              <span className="block text-slate-500 dark:text-slate-400">Trusted</span>
              <strong>{formatCalories(summary.caloriesTrusted)}</strong>
            </div>
            <div className="rounded-2xl bg-slate-100 px-2 py-2 dark:bg-slate-800">
              <span className="block text-slate-500 dark:text-slate-400">Audit</span>
              <strong>{summary.auditEventCount}</strong>
            </div>
          </div>
          {summary.repairTaskCount > 0 || summary.caloriesReviewRequired > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-200">
              {summary.repairTaskCount} repair{summary.repairTaskCount === 1 ? '' : 's'} open -{' '}
              {formatCalories(summary.caloriesReviewRequired)} excluded from proof
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default FoodProofPanel
