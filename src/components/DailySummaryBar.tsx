import type { NutritionTotals, UserSettings } from '../types'
import { calculateMacroProgress } from '../utils/macros'

interface DailySummaryBarProps {
  totals: NutritionTotals
  settings: UserSettings
}

const SUMMARY_ITEMS = [
  {
    label: 'Calories',
    colorClassName: 'bg-emerald-500',
    textClassName: 'text-emerald-700 dark:text-emerald-300',
    getValue: (totals: NutritionTotals) => totals.calories,
    getTarget: (settings: UserSettings) => settings.calorieTarget,
    unit: '',
  },
  {
    label: 'Protein',
    colorClassName: 'bg-sky-500',
    textClassName: 'text-sky-700 dark:text-sky-300',
    getValue: (totals: NutritionTotals) => totals.protein,
    getTarget: (settings: UserSettings) => settings.proteinTarget,
    unit: 'g',
  },
  {
    label: 'Carbs',
    colorClassName: 'bg-orange-400',
    textClassName: 'text-orange-700 dark:text-orange-300',
    getValue: (totals: NutritionTotals) => totals.carbs,
    getTarget: (settings: UserSettings) => settings.carbTarget,
    unit: 'g',
  },
  {
    label: 'Fat',
    colorClassName: 'bg-amber-400',
    textClassName: 'text-amber-700 dark:text-amber-300',
    getValue: (totals: NutritionTotals) => totals.fat,
    getTarget: (settings: UserSettings) => settings.fatTarget,
    unit: 'g',
  },
] as const

function formatValue(value: number): string {
  return `${Math.round(value)}`
}

function formatRemaining(remaining: number): string {
  if (remaining === 0) {
    return 'On target'
  }

  return remaining > 0 ? `${Math.round(remaining)} left` : `${Math.abs(Math.round(remaining))} over`
}

export function DailySummaryBar({ totals, settings }: DailySummaryBarProps) {
  return (
    <div className="app-card space-y-2 px-3 py-2.5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Daily summary
          </p>
          <p className="font-display text-lg text-slate-900 dark:text-white sm:text-2xl">
            {Math.round(totals.calories)} cal
          </p>
        </div>
        <div className="rounded-2xl bg-teal-50 px-3 py-1.5 text-right dark:bg-teal-500/10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">Goal</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
            {settings.calorieTarget} cal
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {SUMMARY_ITEMS.map((item) => {
          const value = item.getValue(totals)
          const target = item.getTarget(settings)
          const progress = calculateMacroProgress(value, target)

          return (
            <div
              key={item.label}
              className="rounded-[18px] border border-black/5 bg-white/60 px-2.5 py-1.5 dark:border-white/10 dark:bg-slate-900/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-semibold sm:text-sm ${item.textClassName}`}>{item.label}</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">
                    {formatValue(value)}
                    {item.unit}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300">
                  {formatRemaining(progress.remaining)}
                </p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${item.colorClassName}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
