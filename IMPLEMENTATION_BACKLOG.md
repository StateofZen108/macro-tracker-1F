# MacroTracker Implementation Backlog

## P0 Release Blockers

### 1. Data coherence across tabs and sessions
- Keep every storage-backed hook subscribed to the shared storage cache.
- Preserve cross-tab sync for log, food, weight, and settings changes through `storage` events and `BroadcastChannel`.
- Regression coverage:
  - Two tabs can log different foods without overwriting each other.
  - `localStorage.clear()` in one tab resets the other tab cleanly.

### 2. Durable local-storage failure handling
- Treat multi-key meal logging as atomic: meal entry save and food usage update must succeed together or fully roll back.
- Preserve unreadable raw payloads for recovery and block silent overwrites when a storage section is corrupted.
- Regression coverage:
  - Quota failures do not leave a partial meal save behind.
  - Corrupted `mt_foods`, `mt_weights`, or `mt_log_*` data is surfaced and protected from silent overwrite.

### 3. Mobile tappability and app chrome safety
- Keep first visible meal actions and first logged rows tappable above sticky and fixed app chrome on 375px to 390px mobile widths.
- Preserve date navigation gestures only inside the date header and not during normal page scrolling.
- Regression coverage:
  - Breakfast add CTA is center-hittable.
  - First logged row is center-hittable after adding an item.

### 4. Weight-history integrity
- Keep one effective weight per day, dedupe same-day storage collisions, and preserve per-entry units.
- Regression coverage:
  - Unit switching converts display values instead of relabeling history.
  - Duplicate same-day raw entries collapse to the latest saved entry.

## P1 Daily-Driver Improvements

### 5. Faster repeat logging
- Move toward one-tap add from search results and a stay-open batch logging mode.
- Add stronger recent/frequent flows and meal templates for repeated meals.

### 6. Consistent destructive-action safety
- Add undo or confirmation to weight delete, food archive/purge, and any dismissible dirty form.
- Replace the single undo slot with a queued undo stack.

### 7. Recovery visibility
- Surface data-health problems in the main app flow, not just Settings.
- Add actionable repair guidance and explicit blocked-save messaging by storage section.

## P2 Reliability and Product Hardening

### 8. Backup and restore
- Add export/import JSON with restore validation and visible last-backup metadata.

### 9. Barcode import trust model
- Tighten duplicate detection, direct scan-and-log flow, and clearer ambiguity handling for Open Food Facts serving metadata.

### 10. Device QA expansion
- Add real-device iPhone Safari and Android Chrome checks for camera permissions, installability, and bottom-sheet ergonomics.
