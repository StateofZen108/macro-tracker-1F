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

Production release also requires:

```powershell
$env:RELEASE_DEVICE_QA_REQUIRED='true'
$env:VITE_APP_BUILD_ID='<candidate-build-id>'
npm run test:device-qa:evidence
```

`npm run test:release` always runs audit, lint, build, bundle, unit, E2E, corpus, preview lanes, and release hygiene. It runs physical-device evidence automatically when `RELEASE_DEVICE_QA_REQUIRED=true` or `VERCEL_ENV=production`.

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

## Device QA

Physical-device evidence lives under `docs/device-qa-results/<build-id>.json`. The manifest must match the release build ID and git SHA and must pass every check defined in `docs/device-qa-runbook.md`.

Do not mark a production release green without a real physical Android or iOS run. Playwright evidence is not a substitute for camera, barcode, OCR capture, PWA install/reopen, and offline logging proof.

