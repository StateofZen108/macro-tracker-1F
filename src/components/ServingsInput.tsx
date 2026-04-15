import { useEffect, useState } from 'react'

interface ServingsInputProps {
  value: number
  onChange: (value: number) => void
  wholePackageServings?: number | null
}

const QUICK_VALUES = [0.5, 1, 2]

function formatServings(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, '')
}

export function ServingsInput({ value, onChange, wholePackageServings = null }: ServingsInputProps) {
  const [draftValue, setDraftValue] = useState(formatServings(value))

  useEffect(() => {
    setDraftValue(formatServings(value))
  }, [value])

  function commitDraft(nextValue: string): void {
    const parsedValue = Number.parseFloat(nextValue.replace(',', '.'))

    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      onChange(parsedValue)
      setDraftValue(formatServings(parsedValue))
      return
    }

    setDraftValue(formatServings(value))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_VALUES.map((quickValue) => (
          <button
            key={quickValue}
            type="button"
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              value === quickValue
                ? 'bg-teal-700 text-white shadow-glow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
            onClick={() => onChange(quickValue)}
          >
            {formatServings(quickValue)}x
          </button>
        ))}
        {typeof wholePackageServings === 'number' && Number.isFinite(wholePackageServings) && wholePackageServings > 1 ? (
          <button
            type="button"
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              value === wholePackageServings
                ? 'bg-teal-700 text-white shadow-glow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
            onClick={() => onChange(wholePackageServings)}
          >
            Whole package
          </button>
        ) : null}
      </div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Servings
        <input
          type="text"
          inputMode="decimal"
          className="field mt-2"
          value={draftValue}
          onChange={(event) => {
            const nextValue = event.target.value.replace(',', '.')
            setDraftValue(nextValue)

            const parsedValue = Number.parseFloat(nextValue)
            if (Number.isFinite(parsedValue) && parsedValue > 0) {
              onChange(parsedValue)
            }
          }}
          onBlur={() => commitDraft(draftValue)}
        />
      </label>
    </div>
  )
}
