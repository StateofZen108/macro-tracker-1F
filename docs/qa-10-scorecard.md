# QA 10 Scorecard

This scorecard defines what "10/10 Cut OS" means for this repo.

## Required Predicates

| Predicate | Automated evidence |
|---|---|
| `release_green` | `npm run lint`, production build, bundle check, unit tests, full E2E, release gate pass |
| `command_aligned` | `tests/e2e/cut-os.spec.ts` asserts Dashboard, Log, Weight, and Coach share diagnosis/action/proof/status attributes |
| `import_trusted` | `tests/unit/historyImport.spec.ts` previews MacroFactor without storage init and marks overlap from supplied local dates |
| `activation_deep_linked` | `tests/e2e/cut-os.spec.ts` opens the cold-user MacroFactor activation CTA and asserts the import button is visible, focused, and in viewport |
| `corpus_trusted` | `tests/unit/historyImport.corpus.spec.ts` verifies anonymized food+weight, weights-only, and unsupported MacroFactor export shapes |
| `proof_bound_answer` | `tests/unit/coachProofAnswer.spec.ts` and `tests/e2e/coach.spec.ts` verify Coach answers from the Cut OS packet without live provider setup |
| `sheet_dismissable` | `tests/e2e/logging.spec.ts` checks Escape close plus dirty discard keep/discard hit testing |
| `chunk_polished` | `npm run build` has no Vite chunk warning; `npm run test:bundle` enforces budgets and HEIC precache exclusion |
| `module_budget_green` | `npm run test:module-budgets` keeps public root modules below the ownership budgets after refactors |
| `onboarding_ready` | `CutOsActivationCard` renders first-viewport activation, MacroFactor import, sealed demo, and next proof; `CutOsSetupChecklist` renders exact counts and route targets |
| `device_qa_green` | `docs/device-qa-runbook.md` records physical camera/barcode/OCR/PWA/offline evidence for the release candidate |
| `release_hygiene_green` | `npm run test:release` passes with 0 warnings, corpus gate enabled, and unknown untracked source files staged, ignored, or documented |
| `security_audit_green` | `npm run test:security:audit` exits 0 with no moderate, high, or critical vulnerabilities |
| `api_hardened` | `tests/unit/productionHardening.spec.ts` verifies request IDs, body limits, rate limits, timeout envelopes, and structured errors |
| `observability_ready` | `tests/unit/productionHardening.spec.ts` verifies Sentry redaction; `npm run test:observability:smoke` proves production server capture with build context |
| `rls_defended` | `tests/unit/productionHardening.spec.ts` verifies the migration and live snapshot validator; `npm run test:supabase:rls-live` proves the deployed database when `SUPABASE_DB_URL` and `psql` are available |
| `production_readiness_green` | `npm run test:production-readiness` validates a committed readiness manifest with device QA, Sentry smoke event, migration verification, and module budget proof |
| `accessible_rails_green` | `npm run test:release:accessible` runs every local rail and any configured external rail, writing `tmp/production-rails-accessible-report.json` with exact pending blockers |
| `production_proof_green` | `npm run test:release:proof` passes against a non-local HTTPS deployment and writes `tmp/production-proof-report.json`; commit mode writes committed device/readiness evidence |
| `food_trust_green` | `npm run test:food-trust` verifies barcode, OCR, custom, missing-basis, conflict, and import trust classification; Add Food surfaces trust state without blocking logging |
| `first_ten_self_evident` | `npm run test:activation` verifies a cold S22 user sees Import history, Log first food, Weigh in, Set cut target, and Ask Coach actions without scroll |
| `coach_paid_path_green` | `npm run test:coach-proof` verifies local proof/setup answers are the paid default and the Coach path does not depend on provider setup |
| `cut_os_historical_validation_green` | `npm run test:cut-os:replay` verifies replay counts for true stalls, spike suppression, training precedence, food trust blocks, false escalations, and missed actionable days |
| `server_deploy_clean` | `npm run test:server:function-typecheck` and `npm run test:server:deploy-clean` verify API/server TypeScript and deploy-log output are clean |
| `standalone_cut_9_candidate` | `npm run test:standalone-cut-9` passes food trust, first-10 activation, Coach proof, Cut OS replay, server typecheck, and deploy-log gates on the same working tree |
| `logger_faster_than_macrofactor` | `npm run test:logger-speed` verifies the unified Add Food session keeps search, barcode, label OCR, custom, saved foods, and advanced methods reachable without reopening sheets, and keeps common-food logging inside the 7-second budget |
| `food_database_trusted` | `npm run test:food-db-trust` verifies provider hit rate, trusted-hit rate, and conflict visibility predicates |
| `cut_os_more_defensible` | `npm run test:cut-os:benchmark` verifies benchmark replay coverage plus training-preservation precedence |
| `paid_ops_ready` | `npm run test:paid-ops` verifies billing state reconciliation and redacted support bundles |
| `native_device_green` | `npm run test:native-device-proof` verifies a current-build physical-device manifest in strict production mode and reports pending evidence locally when no real device proof exists |
| `macrofactor_surpass_candidate` | `npm run test:macrofactor-surpass` passes logger speed, food database trust, Cut OS benchmark, paid ops, and native-device proof rails |
| `daily_reliability_green` | `npm run test:mistake-proof-core` verifies daily guardrails, visible trust repair, surface consistency, Coach repair answers, and food trust classification |
| `ten_out_of_ten_local_candidate` | `npm run test:10` passes every local paid-PWA rail and writes `tmp/10-out-of-10-report.json`; any physical-device or production-only proof is reported as `pending_external`, not hand-waved |
| `paid_10_final_candidate` | All predicates above are true on the same working tree; production releases also pass `npm run test:10:production` and `npm run test:release:production` for the same build ID/git SHA |

## Gate Status

| Gate | Expected result | Last verified |
|---|---|---|
| `npm run lint` | 0 errors, 0 warnings | 2026-04-28: passed with `eslint . --max-warnings=0` |
| `npm run test:security:audit` | 0 moderate/high/critical vulnerabilities | 2026-04-28: passed after hardening dependency updates |
| `$env:VITE_APP_BUILD_ID='cut-os-final-focus-proof'; npm run build` | 0 TypeScript errors, 0 Vite warnings | 2026-04-28: passed, no Vite chunk warning |
| `npm run test:bundle` | Budgets pass, HEIC excluded from precache | 2026-04-28: passed, HEIC excluded from app-shell precache |
| `npm run test:module-budgets` | Public root module budgets pass | 2026-04-28: passed |
| `npm run test:release:accessible` | All locally accessible rails pass; external rails either pass or are explicitly pending | Pending latest run |
| `npm run test:release:proof` | Strict deployed proof passes with Sentry smoke/alerts, Supabase verification, device QA, and committed readiness evidence | Pending real deployment/device evidence |
| `npm run test:standalone-cut-9` | Food trust, activation, Coach proof, Cut OS replay, server typecheck, and deploy-log scanner pass | 2026-04-30: passed locally; deploy-log scanner enforces supplied logs and production strict mode |
| `npm run test:macrofactor-surpass` | Logger speed, provider trust, Cut OS benchmark, paid ops, and native-device proof rails pass | Pending latest run |
| `npm run test:mistake-proof-core` | Daily guardrails, mistake-proof Log, surface consistency, Coach proof, and food trust gates pass | Pending latest run |
| `npm run test:10` | Local paid-PWA 10/10 rails pass and external-only rails are machine-reported as pending when unavailable | Pending latest run |
| `npm run test:10:preview` | Protected Vercel preview proof, feature parity, visual polish, trust, Coach, Cut OS, paid ops, and support/recovery rails pass | Pending latest run |
| `npm run test:10:production` | Strict deployed production proof, physical-device evidence, readiness, and all local paid-PWA rails pass for one build ID/git SHA | Pending external production/device evidence |
| `npm run test:server:function-typecheck` | API/server functions typecheck with 0 diagnostics | 2026-04-30: passed |
| `npm run test:server:deploy-clean` | Vercel deploy log has 0 TypeScript diagnostics, warnings, or function packaging warnings | 2026-04-30: local no-log mode passed; production strict mode requires a supplied deploy log |
| `npm run test:history-import:corpus` | MacroFactor corpus cases pass | 2026-04-28: passed, 5/5 corpus tests |
| `npm run test:unit` | 0 failed tests | 2026-04-28: passed, 265 tests passed; existing documented skips/todos unchanged |
| `npx playwright test tests/e2e --config=playwright.config.ts` | 0 failed tests | 2026-04-28: passed, 54/54 S22 tests |
| `npm run test:release` | 0 failed release checks | 2026-04-28: passed; lint/build/bundle/unit/full E2E/corpus/lane guard/personal-library preview/coach preview all green |
| `npm run test:release:production` | 0 failed production release checks with physical QA and Sentry smoke evidence | Pending real deployment/device evidence; fails by design without committed `docs/production-readiness/<build-id>.json` |

## Current Focus Areas

- Dashboard command must be visible in the S22 first viewport.
- Cold-user Dashboard must show "Build your Cut OS in 10 minutes" in the S22 first viewport, and the sealed demo must not write real food logs or weights.
- Cold-user MacroFactor activation must open Settings on the MacroFactor card; if auto-open is blocked, the focused button remains visible and hittable.
- Log fast path must keep Search, Scan, Quick Add, Copy Previous, Custom, and Logging Settings visible without scroll.
- Weight must show hold/no-apply for one clean slow week and step-lever apply for two clean slow weeks.
- Coach export must mirror the same command, diagnosis, proofs, setup checklist, active action, and action history.
- Coach answers must cite the same Cut OS proof packet locally before any live provider is configured.
- Food logging trust must be explicit for barcode, OCR, catalog, custom, and imported entries; non-trusted foods stay loggable but cannot silently feed Cut OS proof.
- Historical validation must show visible engine replay numbers, not static explanation copy.
- Server/API deploy cleanliness must include both local typecheck and Vercel deploy-log scanning.
- Import preview must never initialize storage or read storage directly.
- MacroFactor corpus coverage must include food+weight, weights-only, and unsupported day-total export shapes with exact expected counts/warnings.
- Bottom-sheet dirty discard must stay above the parent sheet and keep its buttons center-hittable.
- Device QA must attach dated physical-device evidence for camera permission denied/granted, barcode fallback, OCR save, PWA install/reopen, offline logging, and discard hit testing.
- Production readiness must include the live Sentry smoke event ID, Supabase migration verification, and module budget proof for the same build ID and git SHA.
- Accessible rails must be used before production signoff so local/CI automation executes everything available before external evidence is requested.
- Strict production proof must use `npm run test:release:proof` or `npm run release:proof-and-commit`; missing deployed Sentry, Supabase, physical-device, or committed evidence must remain machine-detected blockers.
- MacroFactor-surpass proof must keep local paid value separate from production proof: local domains and E2E can pass on this machine, while `native_device_green` stays pending or strict-red until real-device evidence is committed for the current build.
- Daily reliability must keep one safe next action visible, expose food repair at the exact meal row, suppress unsafe harder-cut CTAs while blockers are open, and keep Dashboard, Log, Weight, and Coach on the same command packet.
- The 10/10 umbrella gate is `npm run test:10` locally, `npm run test:10:preview` for protected Vercel previews, and `npm run test:10:production` for strict production proof. AI meal photo is excluded from all 10/10 gates.

Physical-device QA, live Sentry smoke, and Supabase migration verification require external evidence outside this desktop/headless environment.
