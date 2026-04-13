import type { MealType } from '../../types'

export interface RecentCombinationOption {
  sourceDate: string
  entryCount: number
}

interface RecentCombinationsStripProps {
  meal: MealType
  combinations: RecentCombinationOption[]
  onApplyCombination: (sourceDate: string) => void
}

export function RecentCombinationsStrip({
  meal,
  combinations,
  onApplyCombination,
}: RecentCombinationsStripProps) {
  if (!combinations.length) {
    return null
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
          Recent combinations
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-300">Repeat {meal}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {combinations.map((combination) => (
          <button
            key={`${combination.sourceDate}-${combination.entryCount}`}
            type="button"
            className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={() => onApplyCombination(combination.sourceDate)}
          >
            {combination.sourceDate} · {combination.entryCount} items
          </button>
        ))}
      </div>
    </section>
  )
}
