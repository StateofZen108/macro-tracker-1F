import type { LucideIcon } from 'lucide-react'
import type { TabId } from '../types'

interface AppBottomNavProps {
  items: Array<{ id: TabId; label: string; icon: LucideIcon }>
  activeTab: TabId
  onSelect: (tabId: TabId) => void
}

function AppBottomNav({ items, activeTab, onSelect }: AppBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div
        className="mx-auto grid max-w-[560px] gap-1.5 rounded-[30px] border p-2 shadow-glow backdrop-blur"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          borderColor: 'var(--border-subtle)',
          background: 'color-mix(in srgb, var(--surface-floating) 88%, transparent)',
        }}
      >
        {items.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-[22px] px-2 py-2 text-[0.8rem] font-semibold transition ${
                isActive ? 'text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
              style={
                isActive
                  ? { background: 'var(--action-primary-bg)' }
                  : undefined
              }
              onClick={() => onSelect(tab.id)}
            >
              <Icon className="mb-1 h-4 w-4 shrink-0" />
              <span className="max-w-full truncate">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { AppBottomNav }
