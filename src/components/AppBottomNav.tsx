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
      <div className="mx-auto grid max-w-[480px] grid-cols-4 gap-2 rounded-[30px] border border-black/5 bg-white/80 p-2 shadow-glow backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
        {items.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-[22px] px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              onClick={() => onSelect(tab.id)}
            >
              <Icon className="mb-1 h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { AppBottomNav }
