# Production Readiness Manifests

Each production release candidate needs one committed manifest at:

```text
docs/production-readiness/<build-id>.json
```

The manifest must match the release build ID and current git SHA. It must record the physical-device QA manifest path, live Sentry smoke event ID, release suite status, Sentry alert verification, Supabase migration verification, and module budget result.

Use `npm run write:production-readiness` only to draft the JSON after the release suite, device QA, and Sentry smoke run. Review the generated file, commit it with the release candidate, then run:

```powershell
npm run test:release:accessible
npm run test:production-readiness
npm run test:release:production
```

`npm run test:release:accessible` is the one-command automation rail for everything this machine can access. It runs the full local release suite and conditionally runs external checks when the required URL, secrets, database URL, `psql`, and evidence manifests exist. It never fabricates physical-device, Sentry, or Supabase evidence.

`npm run test:release:production` does not generate readiness files. A missing, stale, incomplete, or uncommitted manifest keeps the production release red.
