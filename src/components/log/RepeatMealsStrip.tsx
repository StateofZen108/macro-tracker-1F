import type { MealTemplate, MealType } from '../../types'

interface RepeatMealsStripProps {
  meal: MealType
  savedMeals: MealTemplate[]
  onApplySavedMeal: (savedMealId: string) => void
}

export function RepeatMealsStrip({
  meal,
  savedMeals,
  onApplySavedMeal,
}: RepeatMealsStripProps) {
  if (!savedMeals.length) {
    return null
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          Saved meals
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-300">Repeat into {meal}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {savedMeals.map((savedMeal) => (
          <button
            key={savedMeal.id}
            type="button"
            className="rounded-full bg-teal-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 transition hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/20"
            onClick={() => onApplySavedMeal(savedMeal.id)}
          >
            {savedMeal.name}
          </button>
        ))}
      </div>
    </section>
  )
}
