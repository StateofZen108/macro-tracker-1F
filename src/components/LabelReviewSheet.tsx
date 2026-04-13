export interface LabelReviewValues {
  name: string
  brand: string
  servingSize: string
  servingUnit: string
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  barcode: string
}

export interface LabelReviewWarning {
  id: string
  severity: 'info' | 'warning' | 'blocked'
  message: string
  field?: keyof LabelReviewValues
}

interface LabelReviewSheetProps {
  values: LabelReviewValues
  previewUrl?: string | null
  fileName?: string | null
  isSaving?: boolean
  errorMessage?: string | null
  warnings?: LabelReviewWarning[]
  saveLabel?: string
  onChange: (field: keyof LabelReviewValues, value: string) => void
  onSubmit: () => void
  onRetake?: (() => void) | null
  onBack: () => void
}

const REQUIRED_FIELDS: Array<keyof LabelReviewValues> = [
  'name',
  'servingSize',
  'servingUnit',
  'calories',
  'protein',
  'carbs',
  'fat',
]

const FIELD_LABELS: Record<keyof LabelReviewValues, string> = {
  name: 'Food name',
  brand: 'Brand',
  servingSize: 'Serving size',
  servingUnit: 'Serving unit',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
  barcode: 'Barcode',
}

function getWarningClasses(severity: LabelReviewWarning['severity']): string {
  if (severity === 'blocked') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
  }

  if (severity === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
  }

  return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200'
}

export function LabelReviewSheet({
  values,
  previewUrl,
  fileName,
  isSaving = false,
  errorMessage,
  warnings = [],
  saveLabel = 'Save reviewed food',
  onChange,
  onSubmit,
  onRetake,
  onBack,
}: LabelReviewSheetProps) {
  const missingFields = REQUIRED_FIELDS.filter((field) => !values[field].trim())
  const blockedWarnings = warnings.filter((warning) => warning.severity === 'blocked')
  const saveBlocked = isSaving || missingFields.length > 0 || blockedWarnings.length > 0
  const orderedWarnings = [...warnings].sort((left, right) => {
    const rank = { blocked: 0, warning: 1, info: 2 } as const
    return rank[left.severity] - rank[right.severity]
  })

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-display text-lg text-slate-900 dark:text-white">Review extracted label</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Confirm the OCR draft before it becomes a saved food. Core fields are required.
        </p>
      </div>

      {previewUrl ? (
        <div className="overflow-hidden rounded-[24px] border border-black/5 bg-white/70 dark:border-white/10 dark:bg-slate-900/70">
          <img
            src={previewUrl}
            alt={fileName ? `Nutrition label preview for ${fileName}` : 'Nutrition label preview'}
            className="h-48 w-full object-cover"
          />
        </div>
      ) : null}

      {missingFields.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Complete the required fields before saving: {missingFields.map((field) => FIELD_LABELS[field]).join(', ')}.
        </div>
      ) : null}

      {orderedWarnings.map((warning) => (
        <div
          key={warning.id}
          className={`rounded-2xl border px-4 py-3 text-sm ${getWarningClasses(warning.severity)}`}
        >
          {warning.message}
        </div>
      ))}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Food name
          <input
            className="field mt-2"
            value={values.name}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="Chicken breast"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Brand (optional)
          <input
            className="field mt-2"
            value={values.brand}
            onChange={(event) => onChange('brand', event.target.value)}
            placeholder="Kirkland"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Serving size
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.servingSize}
              onChange={(event) => onChange('servingSize', event.target.value)}
              placeholder="100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Serving unit
            <input
              className="field mt-2"
              value={values.servingUnit}
              onChange={(event) => onChange('servingUnit', event.target.value)}
              placeholder="g"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Calories
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.calories}
              onChange={(event) => onChange('calories', event.target.value)}
              placeholder="165"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Protein (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.protein}
              onChange={(event) => onChange('protein', event.target.value)}
              placeholder="31"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Carbs (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.carbs}
              onChange={(event) => onChange('carbs', event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Fat (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.fat}
              onChange={(event) => onChange('fat', event.target.value)}
              placeholder="3.6"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Fiber (optional)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={values.fiber}
              onChange={(event) => onChange('fiber', event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Barcode (optional)
            <input
              className="field mt-2"
              inputMode="numeric"
              value={values.barcode}
              onChange={(event) => onChange('barcode', event.target.value)}
              placeholder="0123456789012"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button type="button" className="action-button" onClick={onSubmit} disabled={saveBlocked}>
          {isSaving ? 'Saving...' : saveLabel}
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          {onRetake ? (
            <button type="button" className="action-button-secondary" onClick={onRetake}>
              Retake photo
            </button>
          ) : null}
          <button type="button" className="action-button-secondary" onClick={onBack}>
            Back to foods
          </button>
        </div>
      </div>
    </div>
  )
}
