import type { LucideIcon } from 'lucide-react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type { TabId } from '../types'

interface AppBottomNavProps {
  items: Array<{ id: TabId; label: string; icon: LucideIcon }>
  activeTab: TabId
  onSelect: (tabId: TabId) => void
}

function AppBottomNav({ items, activeTab, onSelect }: AppBottomNavProps) {
  const isPremiumNav = FEATURE_FLAGS.premiumUiV1

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div
        className={`mx-auto grid max-w-[560px] gap-1.5 border shadow-glow backdrop-blur ${
          isPremiumNav ? 'rounded-[24px] p-1.5' : 'rounded-[30px] p-2'
        }`}
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
              className={`flex flex-col items-center justify-center font-semibold transition ${
                isPremiumNav ? 'min-h-[48px] rounded-[18px] px-2 py-2 text-[0.72rem]' : 'min-h-[52px] rounded-[22px] px-2 py-2 text-[0.8rem]'
              } ${
                isActive ? 'text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
              }`}
              style={
                isActive
                  ? { background: 'var(--action-primary-bg)' }
                  : undefined
              }
              onClick={() => onSelect(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              title={tab.label}
            >
              <Icon className={`${isPremiumNav ? 'h-5 w-5 sm:mb-1 sm:h-4 sm:w-4' : 'mb-1 h-4 w-4'} shrink-0`} />
              <span className={isPremiumNav ? 'sr-only sm:not-sr-only sm:max-w-full sm:truncate' : 'max-w-full truncate'}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { AppBottomNav }
