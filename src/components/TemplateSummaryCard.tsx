import { MEAL_LABELS, type FoodLogEntry, type MealTemplateEntry, type MealType } from '../types'

type SummaryEntry = Pick<FoodLogEntry, 'id' | 'foodId' | 'snapshot' | 'servings'> | MealTemplateEntry

interface TemplateSummaryCardProps {
  name?: string
  entries: SummaryEntry[]
  defaultMeal?: MealType | null
  usageCount?: number
  updatedAt?: string
  compact?: boolean
  className?: string
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}`
  }

  return value.toFixed(1).replace(/\.0$/, '')
}

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function buildTotals(entries: SummaryEntry[]) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + entry.snapshot.calories * entry.servings,
      protein: totals.protein + entry.snapshot.protein * entry.servings,
      carbs: totals.carbs + entry.snapshot.carbs * entry.servings,
      fat: totals.fat + entry.snapshot.fat * entry.servings,
      servings: totals.servings + entry.servings,
    }),
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      servings: 0,
    },
  )
}

export function TemplateSummaryCard({
  name,
  entries,
  defaultMeal,
  usageCount,
  updatedAt,
  compact = false,
  className = '',
}: TemplateSummaryCardProps) {
  const totals = buildTotals(entries)
  const updatedLabel = formatUpdatedAt(updatedAt)
  const chipLimit = compact ? 3 : 4

  return (
    <div
      className={`rounded-[24px] border border-black/5 bg-white/60 ${
        compact ? 'px-3 py-3' : 'px-4 py-4'
      } dark:border-white/10 dark:bg-slate-900/60 ${className}`.trim()}
    >
      {name ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`${compact ? 'text-lg' : 'text-xl'} font-display text-slate-900 dark:text-white`}>
              {name}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              {entries.length} food{entries.length === 1 ? '' : 's'} · {formatNumber(totals.servings)} servings
            </p>
          </div>
          {defaultMeal ? (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">
              {MEAL_LABELS[defaultMeal]}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={`${name ? 'mt-3' : ''} space-y-2`}>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}P · {Math.round(totals.carbs)}C ·{' '}
          {Math.round(totals.fat)}F
        </p>
        <div className="flex flex-wrap gap-2">
          {entries.slice(0, chipLimit).map((entry) => (
            <span
              key={entry.id}
              className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-200"
            >
              {entry.snapshot.name} {formatNumber(entry.servings)}x
            </span>
          ))}
          {entries.length > chipLimit ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              +{entries.length - chipLimit} more
            </span>
          ) : null}
        </div>
      </div>

      {!compact && (usageCount !== undefined || updatedLabel) ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          {usageCount !== undefined ? <span>Used {usageCount}x</span> : null}
          {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
