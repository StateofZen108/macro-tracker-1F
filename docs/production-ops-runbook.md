# Production Operations Runbook

This runbook covers the paid-app hardening layer: dependency audit, release hygiene, Sentry observability, API middleware, Supabase defense-in-depth, and device QA evidence.

## Required Release Commands

```powershell
npm run test:security:audit
$env:VITE_APP_BUILD_ID='production-candidate'; npm run build
npm run test:bundle
npm run test:unit
npx playwright test tests/e2e --config=playwright.config.ts
npm run test:release
```

To execute every rail that the current machine can honestly access and get a single report:

```powershell
npm run test:release:accessible
```

This command runs the full local release suite, then automatically runs Sentry smoke, live Supabase RLS verification, device QA evidence validation, readiness-manifest validation, and the strict production release gate only when the required credentials, tools, and manifests are present. It writes `tmp/production-rails-accessible-report.json` and exits green when all accessible rails pass, even if external rails are explicitly pending.

For the paid PWA 10/10 gate, use the umbrella orchestrators:

```powershell
npm run test:10
npm run test:10:preview
npm run test:10:production
```

`npm run test:10` runs every locally testable paid-PWA rail: mistake-proof daily loop, food trust, unified logger speed, local Coach proof, Cut OS replay/benchmark, paid account/support/recovery, visual-polish screenshots, release hygiene, server typecheck, deploy-log scanner, and accessible production rails. It writes `tmp/10-out-of-10-report.json`. External-only rails such as current-build physical-device evidence, live Sentry smoke, and live Supabase proof are recorded as `pending_external` locally instead of being treated as green.

`npm run test:10:preview` adds protected Vercel preview proof and feature parity. `npm run test:10:production` is strict: pending external proof fails the run. AI meal photo is permanently excluded from these gates.

## Branch Preview Proof

Branch previews are not considered verified just because Vercel reports `READY`. The preview proof must also prove that the deployed commit matches the branch, the real Vercel deploy log has zero app-owned TypeScript diagnostics or Vercel/function warnings, and the protected preview can be smoked through the automation bypass.

Preview paid builds use one build-time feature preset instead of dozens of hand-set flags:

```powershell
$env:VITE_APP_FEATURE_PRESET='paid-cut-os-preview'
```

The preset enables the paid Cut OS, premium mobile UI, standalone-cut, MacroFactor-surpass, and mistake-proof trust rails while keeping AI meal photo permanently disabled. `npm run test:preview-feature-parity` loads the protected preview and checks `window.__MT_FEATURE_FLAGS__` so a Vercel `READY` deployment cannot be called verified if it was built with the wrong feature envelope.

Run the preview proof from a clean tree:

```powershell
$env:VERCEL_PREVIEW_PROOF_STRICT='true'
$env:VERCEL_AUTOMATION_BYPASS_SECRET='<vercel-deployment-protection-bypass-secret>'
npm run deploy:vercel:preview-proof
```

If a preview URL already exists, provide it explicitly:

```powershell
$env:VERCEL_PREVIEW_URL='https://<branch-preview>.vercel.app'
npm run deploy:vercel:preview-proof
```

When `VERCEL_PREVIEW_URL` is supplied for an existing deployment, Vercel inspect metadata must expose a commit SHA matching the current branch. When the proof script creates the manual preview itself, commit binding is recorded as `local_clean_tree_deploy`: the script first requires a clean tree, then deploys that exact local HEAD, because Vercel inspect does not expose `--meta` values for manual deployments.

The proof writes:

- `test-results/vercel-deploy.log`: real output from `vercel inspect <preview> --logs`
- `tmp/vercel-preview-smoke-report.json`: protected smoke status
- `tmp/preview-feature-parity-report.json`: deployed feature-preset parity
- `tmp/vercel-preview-proof.json`: combined commit/log/smoke proof

The protected smoke sends `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` and `x-vercel-set-bypass-cookie: true`, stores the returned bypass cookie, then reruns the smoke in Playwright. If the secret is missing and the preview returns Vercel login or `401`, the result is `blocked_by_protection`, not green. Do not disable Deployment Protection to make this pass; configure the bypass secret instead.

Deploy-log cleanliness blocks on app-owned `error TS`, Vercel warnings, NodeNext/module diagnostics, and function packaging warnings. Third-party `npm warn deprecated` lines are recorded as advisories and remain governed by `npm audit`.

To close the strict production proof rails, run the proof orchestrator against a deployed HTTPS build:

```powershell
$env:VITE_APP_BUILD_ID='<non-local-build-id>'
$env:PRODUCTION_BASE_URL='https://<deployment>'
$env:PRODUCTION_SOURCE_GIT_SHA='<deployed-source-full-sha>'
$env:PRODUCTION_STRICT_EXTERNAL_PROOF='true'
$env:OBSERVABILITY_SMOKE_SECRET='<deployment-secret>'
$env:SENTRY_AUTH_TOKEN='<sentry-token>'
$env:SENTRY_ORG='<org>'
$env:SENTRY_PROJECT='<project>'
$env:SUPABASE_DB_URL='<production-postgres-url>'
$env:DEVICE_QA_MODE='auto_android'
npm run test:release:proof
```

`npm run test:release:proof` derives `OBSERVABILITY_SMOKE_URL` from `PRODUCTION_BASE_URL` when it is not supplied, runs every local and external rail, and writes `tmp/production-proof-report.json`. It fails with exact blockers when Sentry, Supabase, a physical device, or committed evidence is unavailable.

Strict proof separates the deployed source commit from the later evidence commit. Device QA and readiness manifests record `sourceGitSha` for the deployed app build; after commit mode creates the evidence-only commit, `tmp/production-proof-report.json` records `evidenceCommitSha`. A committed manifest is not required to contain its own future commit SHA, but if an `evidenceCommitSha` field is present it must match the current evidence commit.

To generate and commit evidence after physical-device proof has been collected, run:

```powershell
$env:DEVICE_QA_OPERATOR_EVIDENCE_JSON='C:\path\to\completed-device-evidence.json'
$env:PRODUCTION_PROOF_AUTO_COMMIT='true'
npm run release:proof-and-commit
```

Commit mode writes `docs/device-qa-results/<build-id>.json` and `docs/production-readiness/<build-id>.json`, commits only the release evidence, then reruns `npm run test:10:production`.

Production release also requires a non-local build ID, physical-device evidence, a live Sentry smoke event, module budgets, Supabase migration verification, and a committed readiness manifest:

```powershell
$env:VITE_APP_BUILD_ID='<candidate-build-id>'
$env:RELEASE_DEVICE_QA_REQUIRED='true'
$env:PRODUCTION_RELEASE_REQUIRED='true'
$env:PRODUCTION_SOURCE_GIT_SHA='<deployed-source-full-sha>'
$env:PRODUCTION_STRICT_EXTERNAL_PROOF='true'
$env:OBSERVABILITY_SMOKE_URL='https://<deployment>/api/observability/smoke'
$env:OBSERVABILITY_SMOKE_SECRET='<deployment-secret>'
$env:SUPABASE_DB_URL='<production-postgres-url>'
$env:SENTRY_AUTH_TOKEN='<sentry-token>'
$env:SENTRY_ORG='<org>'
$env:SENTRY_PROJECT='<project>'
npm run test:device-qa:evidence
npm run test:observability:smoke
npm run test:sentry:alerts
npm run test:supabase:rls-live
npm run test:module-budgets
npm run test:production-readiness
npm run test:release:production
```

`npm run test:release` always runs audit, lint, build, bundle, unit, E2E, corpus, preview lanes, and release hygiene. It runs physical-device evidence automatically when `RELEASE_DEVICE_QA_REQUIRED=true` or `VERCEL_ENV=production`.

`npm run test:release:production` is intentionally stricter than the local release suite. It rejects fallback `local-release-*` build IDs, requires physical-device QA, requires Sentry smoke to be enabled, validates `docs/production-readiness/<build-id>.json`, and runs release hygiene again after the smoke check. In strict 10/10 production mode, `SENTRY_ALERTS_VERIFIED=true` and `SUPABASE_MIGRATION_VERIFIED=true` manual attestations are rejected; Sentry alerts must be verified through the Sentry API and Supabase must be verified live through `psql`. The production readiness manifest must already be committed; use `npm run write:production-readiness` only as a drafting helper before review and commit.

## Observability

Client Sentry uses `VITE_SENTRY_DSN`. Server API routes use `SENTRY_DSN`. Both tag events with build/release context and redact auth headers, emails, tokens, raw OCR text, base64 images, food names, notes, barcodes, and sync payloads before sending.

Configure Sentry alerts before paid release:

| Alert | Rule |
|---|---|
| New issue | Notify immediately for any new unresolved issue in production |
| API 5xx spike | Notify when `api.error_captured` 5xx count exceeds 5 in 10 minutes |
| OCR failure spike | Notify when OCR route failures exceed 3 in 10 minutes |
| Sync failure spike | Notify when sync push/pull/bootstrap failures exceed 3 in 10 minutes |
| Release regression | Notify when a new issue first appears on the current `SENTRY_RELEASE` |

Run `npm run test:sentry:alerts` with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to verify those rules through the Sentry API. If API credentials are unavailable, `SENTRY_ALERTS_VERIFIED=true` is accepted only outside strict 10/10 production mode as a manual attestation and is recorded as such in production readiness.

Production smoke uses `POST /api/observability/smoke` with `X-Observability-Smoke-Secret`. The route captures a synthetic server message and returns the Sentry event ID. The event ID must be recorded in `docs/production-readiness/<build-id>.json`; `OBSERVABILITY_SMOKE_DISABLED=true` is allowed only outside production-required runs.

## API Boundary

Every `api/**` route is wrapped by `server/http/apiMiddleware.ts`. The wrapper owns request IDs, body/query limits, timeouts, rate limits, structured error envelopes, and Sentry capture for uncaught exceptions.

Production rate limiting uses Upstash Redis:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

If Upstash is absent in production, expensive unauthenticated routes fail closed with `rateLimitUnavailable`; authenticated sync routes use in-memory degradation and log the request through the API logger.

## Supabase

`supabase/migrations/20260428130000_sync_rls_constraints.sql` enables RLS on sync tables, adds authenticated user isolation policies, adds constraints for known scopes and payload shape, and hardens sync functions with `search_path = public`.

The server service-role routes remain the production writer path. RLS is still required as defense-in-depth for accidental anon/authenticated direct access.

For live verification, set `SUPABASE_DB_URL` or `DATABASE_URL` and ensure `psql` is available on `PATH`, then run:

```powershell
npm run test:supabase:rls-live
```

The check inspects the production database for RLS-enabled sync tables, authenticated user-isolation policies, required constraints, indexes, and hardened `search_path = public` functions. A successful run writes `tmp/supabase-migration-live-result.json`, which `npm run write:production-readiness` can use as the Supabase verification proof.

## Garmin

Garmin is not considered live until the production deployment has Garmin OAuth credentials, an exact registered callback URL, encrypted token keys, Supabase durable state, background sync protection, and a connected-user smoke test.

Required production env:

```powershell
$env:GARMIN_CLIENT_ID='<garmin-client-id>'
$env:GARMIN_CLIENT_SECRET='<garmin-client-secret>'
$env:GARMIN_PRODUCTION_BASE_URL='https://<deployment>'
$env:GARMIN_REDIRECT_URI='https://<deployment>/api/garmin/callback'
$env:GARMIN_HEALTH_API_URL='<garmin-health-api-url>'
$env:GARMIN_ACTIVITY_API_URL='<garmin-activity-api-url>' # optional when health URL covers the required data
$env:GARMIN_TOKEN_KEY_CURRENT_ID='current-2026-05'
$env:GARMIN_TOKEN_KEY_CURRENT='<base64-32-byte-key>'
$env:GARMIN_BACKGROUND_SYNC_ENABLED='true'
$env:GARMIN_BACKGROUND_SYNC_SECRET='<high-entropy-secret>'
$env:SUPABASE_URL='<supabase-url>'
$env:SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'
```

Register this exact callback URL in the Garmin developer portal for the same client credentials:

```text
https://<deployment>/api/garmin/callback
```

Then verify the deployment:

```powershell
npm run test:garmin:live-readiness
$env:GARMIN_SMOKE_BASE_URL='https://<deployment>'
$env:GARMIN_SMOKE_USER_ACCESS_TOKEN='<supabase-access-token-for-a-garmin-connected-test-user>'
npm run test:garmin:live-smoke
```

`npm run test:garmin:live-readiness` fails if credentials, token encryption, durable state, background sync, or callback URL shape are missing. `npm run test:garmin:live-smoke` fails unless the deployed API reports `providerConfigured=true`, `persistentStoreConfigured=true`, background automation enabled, a connected Garmin user, and a successful `/api/garmin/sync` response.

## Device QA

Physical-device evidence lives under `docs/device-qa-results/<build-id>.json`. The manifest must match the release build ID and git SHA and must pass every check defined in `docs/device-qa-runbook.md`.

Do not mark a production release green without a real physical Android or iOS run. Playwright desktop evidence is not a substitute for camera, barcode, OCR capture, PWA install/reopen, and offline logging proof.

Supported real-device lanes:

- `npm run test:device-qa:auto-android`: detects a USB Android device through ADB and writes operator instructions/evidence under `test-results/device-qa/<build-id>/`.
- `npm run test:device-qa:browserstack`: accepts BrowserStack real-device evidence when `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` are set.
- `npm run write:device-qa:manifest`: converts completed physical-device evidence JSON into the committed manifest format.

Each device check must include `automationMode: "automated"` or `automationMode: "operator_assisted"`. Synthetic or emulator-only evidence fails the release gate.

## Production Readiness Manifest

Readiness manifests live under `docs/production-readiness/<build-id>.json` and must match the deployed source SHA through `sourceGitSha`. In strict production proof, the current evidence commit is validated separately after the manifest is committed. Each manifest records:

- deployed source SHA
- physical-device QA manifest path
- deployed production base URL
- Sentry smoke event ID
- Sentry alert verification mode
- release suite status
- Supabase migration verification mode
- generated production proof report path
- module budget status

The production gate fails if the manifest is missing, stale, incomplete, or uncommitted.
