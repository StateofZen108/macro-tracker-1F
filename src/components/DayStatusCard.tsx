import type { DayConfounderMarker, DayStatus } from '../types'

interface DayStatusCardProps {
  status: DayStatus
  markers: DayConfounderMarker[]
  onChange: (status: DayStatus) => void
  onToggleMarker: (marker: DayConfounderMarker) => void
}

const STATUS_OPTIONS: Array<{ value: DayStatus; label: string; description: string }> = [
  {
    value: 'unmarked',
    label: 'Unmarked',
    description: 'Legacy/default state. Logged days still count provisionally.',
  },
  {
    value: 'complete',
    label: 'Complete',
    description: 'Use when the day is fully logged.',
  },
  {
    value: 'partial',
    label: 'Partial',
    description: 'Exclude incomplete days from actionable coaching.',
  },
  {
    value: 'fasting',
    label: 'Fasting',
    description: 'Intentional zero-calorie day counted as complete.',
  },
]

const MARKER_OPTIONS: Array<{
  value: DayConfounderMarker
  label: string
  description: string
}> = [
  {
    value: 'travel',
    label: 'Travel',
    description: 'Use when routine, food quality, or weigh-ins are disrupted by travel.',
  },
  {
    value: 'illness',
    label: 'Illness',
    description: 'Use when sickness or acute recovery could distort appetite, weight, or activity.',
  },
  {
    value: 'high_calorie_event',
    label: 'High-calorie event',
    description: 'Use when a deliberate social meal or refeed should not silently drive target changes.',
  },
]

export function DayStatusCard({ status, markers, onChange, onToggleMarker }: DayStatusCardProps) {
  const activeOption = STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0]
  const buttonScrollMarginTop = '18rem'
  const buttonScrollMarginBottom = '10rem'

  return (
    <section className="app-card space-y-2 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Day status</p>
        <p className="mt-1 font-display text-xl text-slate-900 dark:text-white sm:text-2xl">
          {activeOption.label}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-[20px] px-3 py-2 text-sm font-semibold transition ${
              status === option.value
                ? 'bg-teal-700 text-white shadow-glow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            onClick={() => onChange(option.value)}
            style={{
              scrollMarginTop: buttonScrollMarginTop,
              scrollMarginBottom: buttonScrollMarginBottom,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Confounders
        </p>
        <div className="grid grid-cols-3 gap-2">
          {MARKER_OPTIONS.map((option) => {
            const active = markers.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-[20px] border px-2 py-2 text-center text-sm transition ${
                  active
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
                    : 'border-black/5 bg-white/70 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
                onClick={() => onToggleMarker(option.value)}
                style={{
                  scrollMarginTop: buttonScrollMarginTop,
                  scrollMarginBottom: buttonScrollMarginBottom,
                }}
              >
                <span className="block font-semibold leading-tight">{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
