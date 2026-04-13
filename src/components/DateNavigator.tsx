import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { addDays, formatDisplayDate, getRelativeDateLabel } from '../utils/dates'

interface DateNavigatorProps {
  date: string
  onChange: (date: string) => void
}

export function DateNavigator({ date, onChange }: DateNavigatorProps) {
  const touchState = useRef<{
    startX: number
    startY: number
    locked: 'horizontal' | 'vertical' | null
  } | null>(null)

  return (
    <div
      className="app-card flex items-center gap-2 px-3 py-2.5"
      onTouchStart={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('button, input, label')) {
          touchState.current = null
          return
        }

        touchState.current = {
          startX: event.changedTouches[0]?.clientX ?? 0,
          startY: event.changedTouches[0]?.clientY ?? 0,
          locked: null,
        }
      }}
      onTouchMove={(event) => {
        if (!touchState.current) {
          return
        }

        const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchState.current.startX
        const deltaY = (event.changedTouches[0]?.clientY ?? 0) - touchState.current.startY

        if (!touchState.current.locked) {
          if (Math.abs(deltaY) > 12 && Math.abs(deltaY) >= Math.abs(deltaX)) {
            touchState.current.locked = 'vertical'
          } else if (Math.abs(deltaX) > 12) {
            touchState.current.locked = 'horizontal'
          }
        }
      }}
      onTouchEnd={(event) => {
        if (!touchState.current || touchState.current.locked !== 'horizontal') {
          touchState.current = null
          return
        }

        const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchState.current.startX
        const deltaY = (event.changedTouches[0]?.clientY ?? 0) - touchState.current.startY

        if (Math.abs(deltaX) >= 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          onChange(addDays(date, deltaX > 0 ? -1 : 1))
        }

        touchState.current = null
      }}
    >
      <button
        type="button"
        className="icon-button h-10 w-10 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
          {getRelativeDateLabel(date)}
        </p>
        <p className="font-display text-lg text-slate-900 dark:text-white sm:text-xl">
          {formatDisplayDate(date)}
        </p>
      </div>
      <label className="icon-button h-10 w-10 cursor-pointer rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl">
        <CalendarDays className="h-5 w-5" />
        <input
          type="date"
          className="sr-only"
          value={date}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="icon-button h-10 w-10 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
