# MacroTracker Implementation Backlog

## P0 Release Blockers

### P0.1 Shared Storage State And Cross-Tab Safety
Status: `in progress`

- Move foods, settings, weights, and logs onto a shared storage-backed subscription model instead of per-hook snapshots.
- Sync tabs and PWA windows through `storage` events plus `BroadcastChannel`.
- Ensure external writes rehydrate local state before the next mutation.

### P0.2 Safe Writes, Recovery Backups, And Purge Guardrails
Status: `in progress`

- Preserve a raw recovery backup before schema normalization or unreadable-data fallback.
- Block writes into unreadable storage sections until the user reviews recovery issues.
- Make food-log writes and `usageCount` updates commit together so quick-add ranking cannot silently drift.
- Refuse permanent food purge when log history cannot be read safely.

### P0.3 Mobile Log-Screen Hit Target Safety
Status: `in progress`

- Give scroll content an explicit bottom clearance tied to the fixed tab bar and safe-area inset.
- Ensure first meal CTAs and first logged rows remain tappable on 375px to 390px mobile viewports.
- Add end-to-end hit-test coverage for the post-log state, not just the empty-meal state.

## P1 Reliability And Daily-Driver Quality

### P1.1 Destructive Action Consistency
Status: `queued`

- Add undo or confirmation to weight deletion and food archive/purge flows.
- Replace the single global undo slot with a queue.
- Add unsaved-changes protection for dismissible sheets.

### P1.2 Data Health Visibility
Status: `queued`

- Surface recovery and storage failures in the primary flows, not just Settings.
- Distinguish offline, quota, unreadable-data, and remote lookup failures with actionable recovery text.

### P1.3 Logging Speed For Repeated Meals
Status: `queued`

- Reduce the add-food flow to fewer taps for common daily meals.
- Keep the sheet open for batch logging when appropriate.
- Add stronger recent/favorite/usual-meal shortcuts.

### P1.4 Backup And Restore
Status: `queued`

- Add export/import JSON backup.
- Validate imports and preserve a restore preview before applying.

## QA Gate

- Playwright must cover cross-tab sync, fixed-nav tappability after logging, and storage recovery guards.
- `npm run lint`, `npm run build`, and `npm run test:e2e` must all pass before the next release cut.
