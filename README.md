# MacroTracker

MacroTracker is a local-first calorie, macro, weight, and coaching PWA built with Vite, React, TypeScript, Tailwind CSS, Recharts, Lucide, and `vite-plugin-pwa`.

It is designed for single-user daily use on mobile. Core tracking still works without an account, and the app remains local-first by default. Optional account-backed sync can now be enabled for the main tracking domains. Local browser storage remains the device cache, with boot-time validation, migrations, and recovery handling.

## What ships today

### Log tab

- Daily logging split into `breakfast`, `lunch`, `dinner`, and `snack`
- Sticky daily summary bar with calorie and macro totals against targets
- Date navigation with previous/next day controls
- Add-food flow with:
  - recent foods and local search
  - quick actions like `Add 1x`
  - remembered `last amount` shortcuts
  - optional keep-open behavior for batch logging
  - custom-serving add flow
- Quick Add for snapshot-only calorie/macro entries
- Copy Previous flow for:
  - whole previous day
  - a single meal from a prior date
  - preview-first append vs replace target behavior
- Meal templates:
  - save a logged meal as a reusable template
  - apply templates to a meal with collision preview
  - delete templates with undo
- Food log row controls:
  - inline serving stepper
  - edit entry
  - delete with undo
- Day status controls:
  - `unmarked`
  - `complete`
  - `partial`
  - `fasting`
- Fasting-day protections:
  - clearing logged intake requires confirmation
  - destructive fasting transition is undoable
  - adding intake to a fasting day converts it out of fasting instead of silently corrupting the state
- Intervention logging on the selected date:
  - name, category, dose, unit, route, time, notes
  - edit and delete flows
  - grouped daily totals

### Foods and food database

- Seed foods plus custom foods
- Immutable log snapshots, so editing a food does not rewrite history
- Duplicate detection when creating foods
- Archive-first food lifecycle instead of normal hard delete
- Reference-aware food handling for historical safety
- Barcode import from Open Food Facts with:
  - camera scan
  - manual barcode entry
  - verified vs needs-confirmation import states
  - explicit offline and error handling
- Nutrition-label OCR flow with:
  - one-photo capture/upload
  - mandatory review before save
  - reviewed nutrient rows stored on the saved food
  - live extraction only when `/api/label-ocr/extract` is deployed with a server-side `GEMINI_API_KEY`

### Weight tab

- Weight logging with stored unit per entry
- Weight display unit can be switched without relabeling old entries
- Historical create, edit, and delete by date
- One weight entry per day
- 7-day trend line and recent trend summary
- Delete with undo
- Ask Coach entry point from the weight view

### Local coaching

- Local heuristic coaching engine with:
  - confidence score `0-100`
  - confidence bands
  - goal modes: `lose`, `maintain`, `gain`
  - estimated TDEE
  - all-days target
  - eating-day target when fasting exists in the analysis window
- Coaching uses:
  - food logs
  - weight history
  - day status completeness
  - intervention confounders
  - storage recovery state
  - recent import state
- Sparse, partial, or low-confidence data stays informational instead of actionable
- Calibration records are collected locally for future confidence calibration

### Coach tab

- Full Ask Coach UI ships now, including:
  - persistent local thread
  - starter prompts
  - compact context snapshots
  - local queue
  - message feedback
  - proposal cards
  - provider scaffold selector
- Current default behavior:
  - no provider is configured
  - questions are stored locally
  - the UI explains that the coach surface is ready but not connected
- Supported scaffold targets:
  - `none`
  - `gemini`
  - `openai`
  - `anthropic`
- Backend scaffold exists under `server/coach`, but live model responses are not active until a provider is connected later

### Settings and recovery

- Macro targets and weight-unit settings
- Goal mode and local coaching toggle
- Optional cross-device sync with:
  - Supabase email magic-link sign-in
  - automatic sync on open, focus, reconnect, and local writes
  - manual `Sync now`
  - one-time bootstrap resolution when local and cloud data both exist
  - blocking dead-letter reporting for non-retriable sync failures
- Food management:
  - create
  - edit
  - archive
  - restore
  - guarded purge
- Data-health reporting:
  - unreadable sections
  - skipped invalid records
  - recovery issues surfaced in the UI
- Backup and restore:
  - export backup JSON
  - import preview
  - `replace` import
  - `merge` import
  - rollback backup before replace

### Reliability and platform behavior

- Cross-tab sync for local data changes
- Optional cross-device sync for:
  - foods
  - food log entries
  - weights
  - day meta
  - activity
  - interventions
  - meal templates
  - partitioned user settings
- Schema versioning and migrations on app boot
- Runtime validation of stored foods, logs, weights, settings, day states, interventions, templates, and coach state
- Recovery backup support for unsafe or unreadable storage transitions
- PWA install support
- Offline app-shell reopen

## What is intentionally not shipped yet

- Garmin or other wearable integrations
- Open Food Facts text search
- Live Ask Coach answers from a configured AI provider
- Offline nutrition-label OCR

Cross-device sync intentionally does **not** yet include:

- household/shared accounts
- coach thread sync
- coach queue sync
- coach feedback sync
- coach provider config sync
- weekly check-in history sync
- coaching calibration sync
- OCR image persistence
- household/shared accounts

## Current product boundaries

- This is a single-user tracker by design.
- Core tracking is fully local-first.
- Optional network dependencies in the shipped app are:
  - Open Food Facts for barcode lookup
  - a deployed `/api/label-ocr/extract` endpoint for live nutrition-label OCR
  - Supabase auth + sync routes when cross-device sync is enabled
- The Coach tab is implemented as a provider-agnostic surface, but it is intentionally keyless by default.
- Public deployment gives reachability from anywhere. Sync gives continuity across signed-in devices. Local browser storage is still the first-line cache on each device.

## Storage model

Persistent keys currently include:

- `mt_schema_version`
- `mt_foods`
- `mt_weights`
- `mt_settings`
- `mt_ui_prefs`
- `mt_meal_templates`
- `mt_day_meta`
- `mt_interventions`
- `mt_coaching_calibration`
- `mt_coach_thread`
- `mt_coach_feedback`
- `mt_coach_queue`
- `mt_coach_config`
- `mt_sync_state`
- `mt_sync_queue`
- `mt_sync_dead_letter`
- `mt_device_id`
- `mt_log_YYYY-MM-DD`
- `mt_recovery_backup`

Important storage behavior:

- Food log entries store immutable nutrition snapshots.
- Weight entries store their own original unit.
- Synced deletes use tombstones for supported domains instead of immediate hard delete.
- Invalid persisted records are skipped from active state and surfaced as recovery issues.
- Protected unreadable sections are blocked from silent overwrite.
- Replace import creates a rollback backup before mutating persisted state.

## Backup and restore

Use the **Settings** tab for backup and restore.

- **Export backup** downloads the current app state as JSON.
- **Replace import** replaces local data after creating a rollback backup.
- **Merge import** keeps current settings and merges foods, weights, logs, templates, day states, interventions, and coach state where supported.
- Import is validated before apply.
- Recovery issues remain visible after boot if bad stored data was skipped.

For the most reliable recovery path:

1. Install the PWA to the home screen.
2. Export backups regularly.
3. Keep at least one recent backup outside the browser profile.
4. Prefer `replace` import over `merge` when doing a full restore.

## Offline behavior

Local features that continue to work offline:

- food logging
- quick add
- copy previous
- meal templates
- weight entry and editing
- day status changes
- intervention logging
- backup export
- viewing the local coach thread
- queueing coach questions locally

Features that do not work fully offline:

- barcode scanning and remote barcode lookup
- live nutrition-label OCR
- sync push/pull while signed in
- any future live Ask Coach provider call

When offline, the app should stay usable as a tracker and make the unavailable network-dependent actions explicit.

## Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

Run the generic dev-server mobile regression suite:

```bash
npm run test:e2e
```

Run the preview-only rollout suites:

```bash
npm run test:e2e:personal-library-preview
npm run test:e2e:coach-preview
npm run test:psmf-phase:preview
npm run test:recovery-layer:preview
npm run test:garmin-connect:preview
npm run test:psmf-garmin:preview
```

Run the phase and Garmin gate suites:

```bash
npm run test:psmf-phase
npm run test:recovery-layer
npm run test:garmin-connect
npm run test:psmf-garmin
```

Run the full local validation suite:

```bash
npm run test:all
```

Run the release signoff gate:

```bash
npm run test:release
```

## Environment variables

Copy `.env.example` to a local `.env` file and populate only the values you need for the features you are enabling.

Current placeholders in `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Do not commit `.env`, `.env.*`, or provider credentials.

## OCR deployment

The nutrition-label OCR frontend expects a server route at `/api/label-ocr/extract`.

- For production, the fastest supported path is a Vite deployment on Vercel with a server-side `GEMINI_API_KEY`.
- Do not expose the Gemini key through `VITE_*`, client code, or browser storage.
- Public deployment makes OCR reachable from anywhere, but app data still remains local to each device browser profile.
- Plain `npm run dev` is still a LAN dev server. End-to-end OCR needs either a deployed server function or a local function runtime such as `vercel dev`.

## Sync deployment

Cross-device sync expects:

- browser env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- server env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- the SQL objects in `supabase/sync-schema.sql` applied to the target Supabase project
- deployed routes:
  - `/api/sync/push`
  - `/api/sync/pull`
  - `/api/sync/bootstrap`
  - `/api/sync/bootstrap/status`

Core tracking still works when sync is not configured.

## Repository hygiene

Generated or local-only directories are intentionally untracked:

- `node_modules/`
- `dist/`
- `test-results/`
- `playwright-report/`
- `coverage/`
- `.vite/`
- `.vercel/`
- `supabase/.temp/`

Temporary debug assets such as `tmp-*.png` are also intentionally excluded from Git.

## Git bootstrap and remote setup

Recommended Git remote setup for this folder:

- create a **private** GitHub repository named `macrotracker`
- use `macro-tracker` only if the preferred name is unavailable
- keep `main` as the protected default branch
- use short-lived topic branches named:
  - `feature/...`
  - `fix/...`
  - `chore/...`

After the first push to GitHub, enable branch protection on `main` with:

- force pushes disabled
- branch must be up to date before merge
- required checks:
  - `lint`
  - `build`
  - `bundle`
  - `unit`
  - `e2e-generic`
  - `e2e-lane-guard`
  - `e2e-coach-preview`
  - `e2e-personal-library-preview`
  - `psmf-phase-domain`
  - `psmf-phase-storage-integration`
  - `psmf-phase-preview`
  - `psmf-phase-replay`
  - `psmf-phase-baseline-guard`
  - `recovery-layer-domain`
  - `recovery-layer-preview`
  - `recovery-layer-replay`
  - `recovery-layer-baseline-guard`
  - `garmin-connect-domain`
  - `garmin-preview`
  - `psmf-garmin-domain`
  - `psmf-garmin-preview`
  - `psmf-garmin-replay`
  - `psmf-garmin-baseline-guard`
- admin bypass left enabled initially for solo maintenance

Before flipping production feature flags such as `VITE_FF_PERSONAL_LIBRARY_V1`, `VITE_FF_COACH_METHOD_V2`, `VITE_FF_PSMF_PHASE_V2`, `VITE_FF_RECOVERY_LAYER_V1`, or `VITE_FF_GARMIN_CONNECT_V1`, require green `release-confidence` and `psmf-garmin-release-confidence` runs on the current `main` commit.

Do not treat local linkage or temp files as source of truth:

- `supabase/.temp/` is local operational state and may contain connection details
- `.vercel/` is local deployment linkage state

## Validation status

Latest local validation run:

- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:lane-guard`
- `npm run test:e2e:personal-library-preview`
- `npm run test:e2e:coach-preview`
- `npm run test:psmf-phase:preview`
- `npm run test:recovery-layer:preview`
- `npm run test:garmin-connect:preview`
- `npm run test:psmf-garmin:preview`
- `npm run test:psmf-phase`
- `npm run test:recovery-layer`
- `npm run test:garmin-connect`
- `npm run test:psmf-garmin`

The package, CI, baseline, and preview-lane commands above are green locally, including `npm run test:release` and `npm run test:psmf-garmin:release-confidence`. Real-device validation on the target phone browser stack is still recommended before treating the app as the only production tracker on that device.
