import type { NutritionTotals, UserSettings } from '../types'
import { calculateMacroProgress } from '../utils/macros'

interface DailySummaryBarProps {
  totals: NutritionTotals
  settings: UserSettings
}

const MACRO_ITEMS = [
  {
    key: 'protein',
    label: 'P',
    fullLabel: 'Protein',
    colorClassName: 'bg-sky-500',
    textClassName: 'text-sky-700 dark:text-sky-300',
    getValue: (totals: NutritionTotals) => totals.protein,
    getTarget: (settings: UserSettings) => settings.proteinTarget,
    unit: 'g',
  },
  {
    key: 'fat',
    label: 'F',
    fullLabel: 'Fat',
    colorClassName: 'bg-amber-400',
    textClassName: 'text-amber-700 dark:text-amber-300',
    getValue: (totals: NutritionTotals) => totals.fat,
    getTarget: (settings: UserSettings) => settings.fatTarget,
    unit: 'g',
  },
  {
    key: 'carbs',
    label: 'C',
    fullLabel: 'Carbohydrates',
    colorClassName: 'bg-orange-400',
    textClassName: 'text-orange-700 dark:text-orange-300',
    getValue: (totals: NutritionTotals) => totals.carbs,
    getTarget: (settings: UserSettings) => settings.carbTarget,
    unit: 'g',
  },
] as const

function formatValue(value: number): string {
  return `${Math.round(value)}`
}

export function DailySummaryBar({ totals, settings }: DailySummaryBarProps) {
  const calorieProgress = calculateMacroProgress(totals.calories, settings.calorieTarget)

  return (
    <div data-testid="daily-summary-card" className="app-card overflow-hidden px-3 py-2.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Daily summary
          </p>
          <p
            data-testid="daily-summary-calories"
            className="truncate font-display text-xl text-slate-900 dark:text-white sm:text-2xl"
          >
            {Math.round(totals.calories)} cal
          </p>
        </div>
        <div
          data-testid="daily-summary-goal"
          className="shrink-0 rounded-2xl bg-teal-50 px-3 py-1.5 text-right dark:bg-teal-500/10"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">Goal</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
            {settings.calorieTarget} cal
          </p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {MACRO_ITEMS.map((item) => {
          const value = item.getValue(totals)
          const target = item.getTarget(settings)
          const progress = calculateMacroProgress(value, target)

          return (
            <div
              key={item.key}
              data-testid={`daily-summary-${item.key}`}
              className="min-w-0 rounded-2xl border border-black/5 bg-white/60 px-2 py-1.5 dark:border-white/10 dark:bg-slate-900/60"
            >
              <div className="flex min-w-0 items-center justify-between gap-1.5">
                <p className={`shrink-0 text-xs font-semibold sm:text-sm ${item.textClassName}`}>
                  <span data-testid={`daily-summary-${item.key}-label`} aria-hidden="true">
                    {item.label}
                  </span>
                  <span className="sr-only">{item.fullLabel}</span>
                </p>
                <p
                  data-testid={`daily-summary-${item.key}-value`}
                  className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-white sm:text-sm"
                >
                  {formatValue(value)}
                  {item.unit}
                </p>
              </div>
              <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${item.colorClassName}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        aria-label="Calorie progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(calorieProgress.percent)}
        role="progressbar"
      >
        <div
          data-testid="daily-summary-calorie-progress"
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${calorieProgress.percent}%` }}
        />
      </div>
    </div>
  )
}
