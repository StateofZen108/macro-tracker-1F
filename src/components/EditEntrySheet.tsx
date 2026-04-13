import { BottomSheet } from './BottomSheet'
import { ServingsInput } from './ServingsInput'
import type { FoodLogEntry } from '../types'

interface NutritionSummary {
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface EditEntrySheetProps {
  entry: FoodLogEntry | null
  nutrition: NutritionSummary | null
  editingError: string | null
  editingServings: number
  onChangeServings: (servings: number) => void
  onClose: () => void
  isDirty: boolean
  onSave: () => void
  onReplaceFood: () => void
  onDelete: () => void
}

function EditEntrySheet({
  entry,
  nutrition,
  editingError,
  editingServings,
  onChangeServings,
  onClose,
  isDirty,
  onSave,
  onReplaceFood,
  onDelete,
}: EditEntrySheetProps) {
  return (
    <BottomSheet
      open={entry !== null}
      title={entry?.snapshot.name ?? 'Edit entry'}
      description={
        entry?.needsReview
          ? 'This entry needs review because its original food record no longer exists.'
          : entry?.snapshot.brand ?? 'Update servings or remove this entry.'
      }
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your serving changes are not saved yet. Discard them and close this sheet?"
    >
      {entry && nutrition ? (
        <div className="space-y-4">
          <div className="rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
            <p className="font-display text-2xl text-slate-900 dark:text-white">{entry.snapshot.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              {entry.snapshot.brand ? `${entry.snapshot.brand} • ` : ''}
              {entry.snapshot.servingSize}
              {entry.snapshot.servingUnit}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              {Math.round(nutrition.calories)} cal • {Math.round(nutrition.protein)}P • {Math.round(nutrition.carbs)}C • {Math.round(nutrition.fat)}F
            </p>
          </div>

          {entry.needsReview ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Relink this entry to a current food or delete it if it is no longer needed.
            </div>
          ) : null}

          {editingError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {editingError}
            </div>
          ) : null}

          <ServingsInput value={editingServings} onChange={onChangeServings} />

          <div className="flex flex-col gap-3">
            <button type="button" className="action-button" onClick={onSave}>
              Save changes
            </button>

            {entry.needsReview ? (
              <button type="button" className="action-button-secondary" onClick={onReplaceFood}>
                Replace food
              </button>
            ) : null}

            <button type="button" className="action-button-secondary text-rose-700 dark:text-rose-300" onClick={onDelete}>
              Delete entry
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}

export { EditEntrySheet }
