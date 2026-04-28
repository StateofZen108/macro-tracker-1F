import type { CutOsActionRecord } from '../../types'

function formatTarget(target: CutOsActionRecord['actionTarget']): string {
  return target.replaceAll('_', ' ')
}

export function CutOsActionHistory({ records }: { records: CutOsActionRecord[] }) {
  if (!records.length) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="cut-os-action-history">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Action history
      </p>
      {records.slice(0, 4).map((record) => (
        <div
          key={record.id}
          className="flex items-center justify-between gap-3 rounded-[18px] bg-slate-100/80 px-3 py-3 text-sm dark:bg-slate-900/70"
        >
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white">{formatTarget(record.actionTarget)}</p>
            {record.failureMessage ? (
              <p className="mt-0.5 truncate text-xs text-rose-700 dark:text-rose-200">{record.failureMessage}</p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {new Date(record.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <span className="status-chip">{record.status}</span>
        </div>
      ))}
    </div>
  )
}
