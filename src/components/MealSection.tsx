import { ChevronDown, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { FavoriteFoodsStrip } from './log/FavoriteFoodsStrip'
import {
  RecentCombinationsStrip,
  type RecentCombinationOption,
} from './log/RecentCombinationsStrip'
import { RepeatMealsStrip } from './log/RepeatMealsStrip'
import { FoodLogItem } from './FoodLogItem'
import {
  MEAL_LABELS,
  type Food,
  type MealTemplate,
  type MealType,
  type NutritionTotals,
  type ResolvedFoodLogEntry,
  type TrustRepairTask,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { recordUiTelemetry } from '../utils/uiTelemetry'

interface MealSectionProps {
  meal: MealType
  entries: ResolvedFoodLogEntry[]
  templates: MealTemplate[]
  favoriteFoods: Food[]
  recentCombinations: RecentCombinationOption[]
  totals: NutritionTotals
  collapsed: boolean
  onToggle: () => void
  onAddFood: () => void
  onAddFavoriteFood: (foodId: string) => void
  onApplyTemplate: (templateId: string) => void
  onApplyRecentCombination: (sourceDate: string) => void
  onBrowseTemplates: () => void
  onSaveTemplate: () => void
  onSaveRecipe?: () => void
  onEditEntry: (entryId: string) => void
  onAdjustEntryServings: (entryId: string, nextServings: number) => void
  onDeleteEntry: (entryId: string) => void
  trustRepairs?: TrustRepairTask[]
}

function formatSubtotal(totals: NutritionTotals): string {
  return `${Math.round(totals.calories)} cal • ${Math.round(totals.protein)}P • ${Math.round(
    totals.carbs,
  )}C • ${Math.round(totals.fat)}F`
}

function macroShare(value: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, (value / total) * 100))
}

function MealMacroRail({ totals }: { totals: NutritionTotals }) {
  const totalMacros = totals.protein + totals.fat + totals.carbs

  return (
    <div
      data-testid="meal-ledger-macro-rail"
      className="flex h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"
      aria-hidden="true"
    >
      <div className="macro-bg-protein h-full" style={{ width: `${macroShare(totals.protein, totalMacros)}%` }} />
      <div className="macro-bg-fat h-full" style={{ width: `${macroShare(totals.fat, totalMacros)}%` }} />
      <div className="macro-bg-carbs h-full" style={{ width: `${macroShare(totals.carbs, totalMacros)}%` }} />
    </div>
  )
}

export function MealSection({
  meal,
  entries,
  templates,
  favoriteFoods,
  recentCombinations,
  totals,
  collapsed,
  onToggle,
  onAddFood,
  onAddFavoriteFood,
  onApplyTemplate,
  onApplyRecentCombination,
  onBrowseTemplates,
  onSaveTemplate,
  onSaveRecipe,
  onEditEntry,
  onAdjustEntryServings,
  onDeleteEntry,
  trustRepairs = [],
}: MealSectionProps) {
  const isPremiumMealLedger = FEATURE_FLAGS.premiumUiV1 && FEATURE_FLAGS.premiumMealLedgerV2
  const entryIds = new Set(entries.map((entry) => entry.id))
  const mealTrustRepairs = trustRepairs.filter(
    (task) => task.status === 'open' && task.logEntryId && entryIds.has(task.logEntryId),
  )

  useEffect(() => {
    if (isPremiumMealLedger) {
      recordUiTelemetry('ui.meal_ledger.v2_rendered', 'Premium meal ledger rendered')
    }
  }, [isPremiumMealLedger])

  return (
    <section
      data-meal-section={meal}
      data-testid="meal-ledger-row"
      data-premium-surface={isPremiumMealLedger ? 'data' : undefined}
      className={`${isPremiumMealLedger ? 'premium-data-surface' : 'app-card'} overflow-hidden`}
      style={{
        scrollMarginTop: '34rem',
        scrollMarginBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 7.5rem))',
      }}
    >
      <div className={`flex items-center gap-3 ${isPremiumMealLedger ? 'px-3 py-3' : 'px-4 py-4'}`}>
        <button
          type="button"
          className={`flex flex-1 text-left ${isPremiumMealLedger ? 'min-w-0 items-center gap-3' : 'items-start gap-3'}`}
          onClick={onToggle}
        >
          <div
            className={`${isPremiumMealLedger ? 'mt-0' : 'mt-1'} rounded-full bg-teal-100 p-1 text-teal-700 transition dark:bg-teal-500/10 dark:text-teal-300 ${
              collapsed ? '-rotate-90' : 'rotate-0'
            }`}
          >
            <ChevronDown className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <p
                className={`truncate font-display text-slate-900 dark:text-white ${
                  isPremiumMealLedger ? 'text-xl' : 'text-2xl'
                }`}
              >
                {MEAL_LABELS[meal]}
              </p>
              {isPremiumMealLedger ? (
                <p className="shrink-0 text-sm font-semibold text-slate-900 dark:text-white">
                  {Math.round(totals.calories)} cal
                </p>
              ) : null}
            </div>
            {isPremiumMealLedger ? (
              <>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  <span>
                    {entries.length} item{entries.length === 1 ? '' : 's'}
                  </span>
                  <span className="macro-color-protein">{Math.round(totals.protein)}P</span>
                  <span className="macro-color-fat">{Math.round(totals.fat)}F</span>
                  <span className="macro-color-carbs">{Math.round(totals.carbs)}C</span>
                  {mealTrustRepairs.length ? (
                    <span
                      data-testid="meal-trust-repair-chip"
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                    >
                      {mealTrustRepairs.length} repair
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 max-w-[15rem]">
                  <MealMacroRail totals={totals} />
                </div>
              </>
            ) : null}
            <p className={isPremiumMealLedger ? 'sr-only' : 'text-sm text-slate-500 dark:text-slate-300'}>
              {entries.length} item{entries.length === 1 ? '' : 's'} • {formatSubtotal(totals)}
            </p>
          </div>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onAddFood}
          aria-label={`Add food to ${meal}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {!collapsed ? (
        <div className="space-y-3 border-t border-black/5 px-4 py-4 dark:border-white/10">
          <button
            type="button"
            className="action-button-secondary w-full"
            onClick={onAddFood}
            style={{ scrollMarginTop: '34rem' }}
          >
            Add food
          </button>

          {templates.length || favoriteFoods.length || recentCombinations.length || entries.length ? (
            <div className="flex flex-wrap gap-2">
              {entries.length ? (
                <>
                  <button
                    type="button"
                    className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={onSaveTemplate}
                    style={{
                      scrollMarginTop: '34rem',
                      scrollMarginBottom:
                        'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 7.5rem))',
                    }}
                  >
                    Save as saved meal
                  </button>
                  {onSaveRecipe ? (
                    <button
                      type="button"
                      className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      onClick={onSaveRecipe}
                    >
                      Save as recipe
                    </button>
                  ) : null}
                </>
              ) : null}
              {templates.length ? (
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={onBrowseTemplates}
                  style={{
                    scrollMarginTop: '34rem',
                    scrollMarginBottom:
                      'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 7.5rem))',
                  }}
                >
                  More saved meals
                </button>
              ) : null}
            </div>
          ) : null}
          <FavoriteFoodsStrip meal={meal} foods={favoriteFoods} onAddFood={onAddFavoriteFood} />
          <RepeatMealsStrip
            meal={meal}
            savedMeals={templates.slice(0, 3)}
            onApplySavedMeal={onApplyTemplate}
          />
          <RecentCombinationsStrip
            meal={meal}
            combinations={recentCombinations}
            onApplyCombination={onApplyRecentCombination}
          />
          {entries.length ? (
            <>
              {entries.map((entry) => (
                <FoodLogItem
                  key={entry.id}
                  entry={entry}
                  onEdit={() => onEditEntry(entry.id)}
                  onDecreaseServings={() => onAdjustEntryServings(entry.id, Math.max(0.5, entry.servings - 0.5))}
                  onIncreaseServings={() => onAdjustEntryServings(entry.id, entry.servings + 0.5)}
                  onDelete={() => onDeleteEntry(entry.id)}
                  trustRepair={trustRepairs.find((task) => task.logEntryId === entry.id && task.status === 'open')}
                />
              ))}
            </>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-4 text-left transition hover:bg-teal-100/70 dark:border-teal-500/40 dark:bg-teal-500/10 dark:hover:bg-teal-500/20"
              onClick={onAddFood}
              style={{ scrollMarginTop: '34rem' }}
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Add your first item</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Log a food to start this meal.
                </p>
              </div>
              <Plus className="h-5 w-5 text-teal-700 dark:text-teal-300" />
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
