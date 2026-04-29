import { useEffect } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type { NutritionTotals, UserSettings } from '../types'
import { calculateMacroProgress } from '../utils/macros'
import { recordUiTelemetry } from '../utils/uiTelemetry'

interface DailySummaryBarProps {
  totals: NutritionTotals
  settings: UserSettings
}

const MACRO_ITEMS = [
  ['protein', 'P', 'Protein', 'macro-color-protein', 'macro-bg-protein', 'text-sky-700 dark:text-sky-300', 'bg-sky-500'],
  ['fat', 'F', 'Fat', 'macro-color-fat', 'macro-bg-fat', 'text-amber-700 dark:text-amber-300', 'bg-amber-400'],
  ['carbs', 'C', 'Carbohydrates', 'macro-color-carbs', 'macro-bg-carbs', 'text-orange-700 dark:text-orange-300', 'bg-orange-400'],
] as const

function getMacroValue(key: (typeof MACRO_ITEMS)[number][0], totals: NutritionTotals): number {
  return key === 'protein' ? totals.protein : key === 'fat' ? totals.fat : totals.carbs
}

function getMacroTarget(key: (typeof MACRO_ITEMS)[number][0], settings: UserSettings): number {
  return key === 'protein' ? settings.proteinTarget : key === 'fat' ? settings.fatTarget : settings.carbTarget
}

export function DailySummaryBar({ totals, settings }: DailySummaryBarProps) {
  const isPremiumSummary = FEATURE_FLAGS.premiumUiV1 && FEATURE_FLAGS.premiumLogSummaryV2
  const calorieProgress = calculateMacroProgress(totals.calories, settings.calorieTarget)

  useEffect(() => {
    if (isPremiumSummary) {
      recordUiTelemetry('ui.summary.v2_rendered', 'Premium daily summary rendered')
    }
  }, [isPremiumSummary])

  return (
    <div
      data-testid="daily-summary-card"
      data-premium-surface={isPremiumSummary ? 'command' : undefined}
      className={`overflow-hidden px-3 py-2.5 ${
        isPremiumSummary ? 'premium-command-surface text-white' : 'app-card'
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isPremiumSummary ? 'text-teal-100/75' : 'text-teal-700 dark:text-teal-300'
            }`}
          >
            Daily summary
          </p>
          <p
            data-testid="daily-summary-calories"
            className={`truncate font-display text-[1.55rem] leading-none ${
              isPremiumSummary ? 'text-white' : 'text-slate-900 dark:text-white'
            } sm:text-3xl`}
          >
            {Math.round(totals.calories)} cal
          </p>
        </div>
        <div
          data-testid="daily-summary-goal"
          className={`shrink-0 rounded-2xl px-3 py-1.5 text-right ${
            isPremiumSummary
              ? 'border border-white/10 bg-white/10 shadow-sm'
              : 'bg-teal-50 dark:bg-teal-500/10'
          }`}
        >
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
              isPremiumSummary ? 'text-teal-100/75' : 'text-teal-700 dark:text-teal-300'
            }`}
          >
            Goal
          </p>
          <p
            className={`text-sm font-semibold sm:text-base ${
              isPremiumSummary ? 'text-white' : 'text-slate-900 dark:text-white'
            }`}
          >
            {settings.calorieTarget} cal
          </p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {MACRO_ITEMS.map(([key, label, fullLabel, premiumText, premiumBar, legacyText, legacyBar]) => {
          const value = getMacroValue(key, totals)
          const target = getMacroTarget(key, settings)
          const progress = calculateMacroProgress(value, target)

          return (
            <div
              key={key}
              data-testid={`daily-summary-${key}`}
              data-macro-token={isPremiumSummary ? key : undefined}
              className={`min-w-0 rounded-2xl border px-2 py-1.5 ${
                isPremiumSummary
                  ? 'border-white/10 bg-white/[0.07]'
                  : 'border-black/5 bg-white/60 dark:border-white/10 dark:bg-slate-900/60'
              }`}
            >
              <div className="flex min-w-0 items-center justify-between gap-1.5">
                <p className={`shrink-0 text-xs font-semibold sm:text-sm ${isPremiumSummary ? premiumText : legacyText}`}>
                  <span data-testid={`daily-summary-${key}-label`} aria-hidden="true">
                    {label}
                  </span>
                  <span className="sr-only">{fullLabel}</span>
                </p>
                <p
                  data-testid={`daily-summary-${key}-value`}
                  className={`min-w-0 truncate text-xs font-semibold sm:text-sm ${
                    isPremiumSummary ? 'text-white' : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {Math.round(value)}g
                </p>
              </div>
              <div
                aria-hidden="true"
                className={`mt-1 h-1 overflow-hidden rounded-full ${
                  isPremiumSummary ? 'bg-white/10' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              >
                <div
                  className={`h-full rounded-full ${isPremiumSummary ? premiumBar : legacyBar}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div
        className={`mt-2 h-1.5 overflow-hidden rounded-full ${
          isPremiumSummary ? 'bg-white/10' : 'bg-slate-200 dark:bg-slate-800'
        }`}
        aria-label="Calorie progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(calorieProgress.percent)}
        role="progressbar"
      >
        <div
          data-testid="daily-summary-calorie-progress"
          className={`h-full rounded-full ${isPremiumSummary ? 'macro-bg-calories' : 'bg-emerald-500'}`}
          style={{ width: `${calorieProgress.percent}%` }}
        />
      </div>
    </div>
  )
}
