import type { Food, MealType } from '../../types'

interface FavoriteFoodsStripProps {
  meal: MealType
  foods: Food[]
  onAddFood: (foodId: string) => void
}

export function FavoriteFoodsStrip({ meal, foods, onAddFood }: FavoriteFoodsStripProps) {
  if (!foods.length) {
    return null
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
          Favorites
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-300">Fast add to {meal}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {foods.map((food) => (
          <button
            key={food.id}
            type="button"
            className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 transition hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
            onClick={() => onAddFood(food.id)}
          >
            {food.name}
          </button>
        ))}
      </div>
    </section>
  )
}
