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
| `onboarding_ready` | `CutOsActivationCard` renders first-viewport activation, MacroFactor import, sealed demo, and next proof; `CutOsSetupChecklist` renders exact counts and route targets |
| `device_qa_green` | `docs/device-qa-runbook.md` records physical camera/barcode/OCR/PWA/offline evidence for the release candidate |
| `release_hygiene_green` | `npm run test:release` passes with 0 warnings, corpus gate enabled, and unknown untracked source files staged, ignored, or documented |
| `security_audit_green` | `npm run test:security:audit` exits 0 with no moderate, high, or critical vulnerabilities |
| `api_hardened` | `tests/unit/productionHardening.spec.ts` verifies request IDs, body limits, rate limits, timeout envelopes, and structured errors |
| `observability_ready` | `tests/unit/productionHardening.spec.ts` verifies Sentry redaction; production DSNs enable client/server capture with build context |
| `rls_defended` | `tests/unit/productionHardening.spec.ts` verifies the Supabase RLS/constraint migration includes policies, constraints, and hardened search paths |
| `paid_10_final_candidate` | All predicates above are true on the same working tree |

## Gate Status

| Gate | Expected result | Last verified |
|---|---|---|
| `npm run lint` | 0 errors, 0 warnings | 2026-04-28: passed with `eslint . --max-warnings=0` |
| `npm run test:security:audit` | 0 moderate/high/critical vulnerabilities | 2026-04-28: passed after hardening dependency updates |
| `$env:VITE_APP_BUILD_ID='cut-os-final-focus-proof'; npm run build` | 0 TypeScript errors, 0 Vite warnings | 2026-04-28: passed, no Vite chunk warning |
| `npm run test:bundle` | Budgets pass, HEIC excluded from precache | 2026-04-28: passed, HEIC excluded from app-shell precache |
| `npm run test:history-import:corpus` | MacroFactor corpus cases pass | 2026-04-28: passed, 5/5 corpus tests |
| `npm run test:unit` | 0 failed tests | 2026-04-28: passed, 265 tests passed; existing documented skips/todos unchanged |
| `npx playwright test tests/e2e --config=playwright.config.ts` | 0 failed tests | 2026-04-28: passed, 54/54 S22 tests |
| `npm run test:release` | 0 failed release checks | 2026-04-28: passed; lint/build/bundle/unit/full E2E/corpus/lane guard/personal-library preview/coach preview all green |

## Current Focus Areas

- Dashboard command must be visible in the S22 first viewport.
- Cold-user Dashboard must show "Build your Cut OS in 10 minutes" in the S22 first viewport, and the sealed demo must not write real food logs or weights.
- Cold-user MacroFactor activation must open Settings on the MacroFactor card; if auto-open is blocked, the focused button remains visible and hittable.
- Log fast path must keep Search, Scan, Quick Add, Copy Previous, Custom, and Logging Settings visible without scroll.
- Weight must show hold/no-apply for one clean slow week and step-lever apply for two clean slow weeks.
- Coach export must mirror the same command, diagnosis, proofs, setup checklist, active action, and action history.
- Coach answers must cite the same Cut OS proof packet locally before any live provider is configured.
- Import preview must never initialize storage or read storage directly.
- MacroFactor corpus coverage must include food+weight, weights-only, and unsupported day-total export shapes with exact expected counts/warnings.
- Bottom-sheet dirty discard must stay above the parent sheet and keep its buttons center-hittable.
- Device QA must attach dated physical-device evidence for camera permission denied/granted, barcode fallback, OCR save, PWA install/reopen, offline logging, and discard hit testing.

Physical-device QA is the only release predicate that requires external evidence outside this desktop/headless environment.
