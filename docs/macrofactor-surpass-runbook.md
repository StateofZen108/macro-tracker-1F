# MacroFactor-Surpass Runbook

This runbook defines the rails for moving from "strong standalone cut app" to "credible MacroFactor alternative for serious lifters."

## Product Bar

The product must beat MacroFactor on the daily cut loop:

- Faster common food logging from the first Add Food session.
- Stronger food trust through review-required defaults for disputed, inferred, low-confidence, OCR, AI, and imported foods.
- Coach answers that cite the current Cut OS command, proof, blockers, and action history before optional live-provider escalation.
- Cut decisions that show historical replay proof: true stalls, expected-spike suppression, training-leak precedence, food-trust blocks, false escalations, and missed actionable days.
- Production rails that do not confuse local green with deployed proof.

## Owned Modules

| Area | Owner |
|---|---|
| Unified logger session model | `src/domain/unifiedLogger.ts` |
| Logger speed gate | `src/domain/loggerSpeed.ts` |
| AI meal photo classification | `src/domain/aiMealCapture.ts`, `api/meal-ai/analyze.ts` |
| Food provider trust scoring | `src/domain/foodDatabaseTrust.ts` |
| Food trust coaching gate | `src/domain/foodTrust.ts` |
| Cut OS benchmark | `src/domain/cutOsBenchmark.ts` |
| Strength preservation | `src/domain/trainingPreservation.ts` |
| Coach proof answer | `src/domain/coachProofAnswer.ts`, `src/app/useCoachController.ts` |
| Billing/account state | `src/domain/accountState.ts`, `server/billing/*` |
| Support bundle redaction | `src/domain/supportBundle.ts`, `server/support/*` |
| Native production proof | `scripts/check-native-device-proof.mjs`, `scripts/run-device-qa-android.mjs` |

## Gate Commands

Run the complete local MacroFactor-surpass gate:

```powershell
npm run test:macrofactor-surpass
```

Run individual rails while developing:

```powershell
npm run test:logger-speed
npm run test:ai-meal-capture
npm run test:food-db-trust
npm run test:cut-os:benchmark
npm run test:paid-ops
npm run test:native-device-proof
```

Production release still requires the strict external proof workflow:

```powershell
npm run test:release:proof
```

## Evidence Rules

- AI photo entries are never trusted before review.
- Provider conflicts are review-required, even when a barcode/search hit exists.
- Support bundles must keep diagnostics useful while redacting private food names, OCR text, images, barcodes, notes, auth, tokens, and emails.
- Physical-device evidence is not simulated. Local runs may report pending evidence; strict production runs fail until a current-build manifest exists.
- A production-ready claim must cite a clean committed tree, deployed build ID, Sentry smoke, Supabase live verification or attestation, native-device proof, and readiness manifests.
