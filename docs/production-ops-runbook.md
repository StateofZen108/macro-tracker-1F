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

Production release also requires a non-local build ID, physical-device evidence, a live Sentry smoke event, module budgets, Supabase migration verification, and a committed readiness manifest:

```powershell
$env:VITE_APP_BUILD_ID='<candidate-build-id>'
$env:RELEASE_DEVICE_QA_REQUIRED='true'
$env:PRODUCTION_RELEASE_REQUIRED='true'
$env:OBSERVABILITY_SMOKE_URL='https://<deployment>/api/observability/smoke'
$env:OBSERVABILITY_SMOKE_SECRET='<deployment-secret>'
$env:SUPABASE_DB_URL='<production-postgres-url>'
$env:SENTRY_ALERTS_VERIFIED='true'
$env:SUPABASE_MIGRATION_VERIFIED='true'
npm run test:device-qa:evidence
npm run test:observability:smoke
npm run test:supabase:rls-live
npm run test:module-budgets
npm run test:production-readiness
npm run test:release:production
```

`npm run test:release` always runs audit, lint, build, bundle, unit, E2E, corpus, preview lanes, and release hygiene. It runs physical-device evidence automatically when `RELEASE_DEVICE_QA_REQUIRED=true` or `VERCEL_ENV=production`.

`npm run test:release:production` is intentionally stricter than the local release suite. It rejects fallback `local-release-*` build IDs, requires physical-device QA, requires Sentry smoke to be enabled, validates `docs/production-readiness/<build-id>.json`, and runs release hygiene again after the smoke check. The production readiness manifest must already be committed; use `npm run write:production-readiness` only as a drafting helper before review and commit.

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

## Device QA

Physical-device evidence lives under `docs/device-qa-results/<build-id>.json`. The manifest must match the release build ID and git SHA and must pass every check defined in `docs/device-qa-runbook.md`.

Do not mark a production release green without a real physical Android or iOS run. Playwright evidence is not a substitute for camera, barcode, OCR capture, PWA install/reopen, and offline logging proof.

## Production Readiness Manifest

Readiness manifests live under `docs/production-readiness/<build-id>.json` and must match the current git SHA. Each manifest records:

- physical-device QA manifest path
- Sentry smoke event ID
- release suite status
- Sentry alert verification
- Supabase migration verification
- module budget status

The production gate fails if the manifest is missing, stale, incomplete, or uncommitted.
