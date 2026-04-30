# Cut OS Runbook

Cut OS turns the app into one daily cut command with proof, blockers, and a next action. Dashboard, Log, Weight, and Coach must render the same `CutOsSurfaceModel`.

## Modules

| Area | Module |
|---|---|
| Pure command/proof selector | `src/domain/cutOs.ts` |
| Cold-user activation selector and sealed demo model | `src/domain/cutOsActivation.ts` |
| Action reducer/state machine | `src/domain/cutOsActions.ts` |
| Action repository | `src/utils/storage/cutOsActions.ts` |
| Activation repository | `src/utils/storage/cutOsActivation.ts` |
| React surface assembly | `src/hooks/useCutOsSurface.ts` |
| Settings focus request state | `src/app/useAppShell.ts`, `src/screens/SettingsScreen.tsx` |
| Proof-bound Coach answers | `src/domain/coachProofAnswer.ts`, `src/hooks/useCoach.ts`, `src/app/useCoachController.ts` |
| Daily mistake-proof guardrails | `src/domain/dailyGuardrails.ts`, `src/utils/storage/dailyGuardrails.ts`, `src/components/cut-os/DailyGuardrailStrip.tsx` |
| Surface consistency guard | `src/domain/surfaceConsistency.ts`, `src/hooks/useCutOsSurface.ts` |
| Food trust repair tasks | `src/domain/foodTrust.ts`, `src/components/FoodLogItem.tsx`, `src/components/MealSection.tsx` |
| Activation renderer | `src/components/cut-os/CutOsActivationCard.tsx` |
| Command renderer | `src/components/cut-os/CutOsCommandCard.tsx` |
| Setup checklist | `src/components/cut-os/CutOsSetupChecklist.tsx` |
| Proof stack | `src/components/cut-os/CutOsProofStack.tsx` |
| Action history | `src/components/cut-os/CutOsActionHistory.tsx` |
| History import purity | `src/utils/storage/historyImport.ts`, `src/hooks/useHistoryImport.ts` |
| Release budgets | `vite.config.ts`, `scripts/check-chunk-budgets.mjs` |
| MacroFactor corpus gate | `tests/fixtures/historyImport/macrofactor/corpus`, `tests/unit/historyImport.corpus.spec.ts`, `scripts/run-release-suite.mjs` |
| Device QA evidence | `docs/device-qa-runbook.md` |

## State Transitions

| State | Entry | Exit | Outcome | Precedence |
|---|---|---|---|---|
| `cut_os_setup_required` | Missing history, training, food trust, or import proof | Setup checklist complete | `cut_os_collecting_proof` | Feature flag off hides surfaces |
| `cut_os_activation_needs_proof` | Setup or proof collection command reaches Dashboard | Import, log, weigh, train, review food, or start demo | Routes to next proof or `cut_os_activation_demo_active` | Real command stays source of truth |
| `cut_os_activation_demo_active` | User taps Try demo cut | Exit demo | Synthetic `CutOsSurfaceModel` renders across surfaces | Real logs, weights, settings, and actions are not mutated |
| `settings_focus_idle` | No pending Settings focus request | Cut OS activation import CTA tapped | `settings_focus_pending` | Newest request wins |
| `settings_focus_pending` | `useAppShell` stores a focus request | Settings mounts and target ref resolves | `settings_focus_scrolled` | Newer request supersedes older request |
| `settings_focus_scrolled` | MacroFactor import card scrolled into viewport | Focus succeeds or file picker is blocked | `settings_focus_consumed` or `settings_focus_failed` | Manual user click cancels delayed auto-open |
| `settings_focus_consumed` | Target button focused and optional file picker requested | New focus request arrives | `settings_focus_pending` | Consumed request is never replayed |
| `settings_focus_failed` | Target ref missing or focus path blocked | User opens section manually or new request arrives | Idle or pending | Diagnostic is retained |
| `cut_os_collecting_proof` | Setup complete, no actionable verdict | Clean proof or blocker appears | `cut_os_command_issued` or `cut_os_blocked` | Newest local snapshot wins |
| `cut_os_blocked` | Food trust, logging, import, or phase blocker exists | Blocker resolves | Recompute diagnosis | Deleted blocker wins |
| `cut_os_command_issued` | One command CTA exists | User acts or data changes | Proposed action or recompute | User action wins during cooldown |
| `cut_os_action_proposed` | User activates CTA | Apply, defer, failure, or recompute | Stored proposed record | Stale command blocks confirmation |
| `cut_os_action_applied` | Mutation succeeds | Cooldown starts | Applied record persists | Applied record wins |
| `cut_os_action_deferred` | User defers | New date/data invalidates command | Deferred record persists | Same command id suppressed |
| `cut_os_action_failed` | Save or mutation fails | Retry or data change | Failed record persists | Target mutation rolls back |
| `cut_os_cooldown` | Applied action inside 7 days | Timer or manual reset | Harder escalation suppressed | Manual reset wins |
| `history_import_idle` | Import section loads | Files selected | Previewing | New selection wins |
| `history_import_previewing` | File read starts | Parse success/failure | Ready or failed | Latest selection owns state |
| `history_import_preview_ready` | Preview succeeds | Apply, clear, or new files | Applying/idle/previewing | New preview supersedes old |
| `history_import_preview_failed` | Parser fails | New files selected | Previewing | Latest selected files own error |
| `history_import_applying` | User confirms import | Rollback and apply pass/fail | Applied or apply failed | Apply disabled during state |
| `history_import_applied` | Writes complete | Dismiss or new files | Idle or previewing | Storage broadcast refreshes app |
| `history_import_apply_failed` | Snapshot/apply fails | Retry or new files | Applying or previewing | Data remains unchanged |
| `corpus_unverified` | Corpus fixture/parser/test changes | Corpus test starts | `corpus_verifying` | Latest working tree owns verification |
| `corpus_verifying` | Corpus test running | All cases pass or any fails | Verified or failed | Any failed case fails the corpus gate |
| `corpus_verified` | Corpus cases pass | Fixture/parser/test changes | Unverified | Latest source change invalidates prior verification |
| `corpus_failed` | Any corpus case fails | Fixture/parser fixed and rerun | Verifying | Parser reason remains visible |
| `coach_proof_idle` | Coach ready for input | User submits a non-empty question | `coach_proof_answering` | Empty question blocks transition |
| `coach_proof_answering` | Proof-bound answer generation starts | Answer saves, setup blocks, or save fails | Answered, blocked, or failed | Submit-time Cut OS snapshot wins |
| `coach_proof_answered` | Thread write succeeds | User asks another question | Idle | Feedback applies to saved message ID |
| `coach_proof_blocked` | Cut OS packet missing or setup incomplete | User follows setup/import/log CTA | Idle | No target mutation occurs |
| `coach_proof_failed` | Thread write fails | User retries | Answering | Previous thread remains unchanged |
| `daily_guardrails_ready` | Shared model computes with no blockers | New repair, stale data, or mismatch appears | Actionable or blocked | Latest local snapshot wins |
| `daily_guardrails_blocked` | Food trust, stale proof, recovery, or surface mismatch blocks the day | User resolves the blocker | Recompute into ready/actionable | Deleted blocker beats stale command |
| `trust_repair_open` | Food trust issue is detected | User reviews, fixes, or dismisses | Resolved or dismissed | User review wins over provider update |
| `surface_consistency_mismatch` | Dashboard, Log, Weight, or Coach disagree | Shared model recomputes | Verified | Mismatch hides unsafe CTAs |
| `sheet_closed` | Sheet unmounted | Open request | Open | Latest open wins |
| `sheet_open` | Sheet mounted | Clean close or dirty close | Closed or discard confirm | Active sheet owns focus |
| `sheet_discard_confirm` | Dirty close requested | Keep editing or discard | Open or closed | Dialog owns pointer/focus |
| `release_red` | Any gate fails | All gates pass with zero warnings | Release green | New failure returns red |
| `release_green` | All gates pass | Source/test/build/doc changes | Release red pending rerun | Latest tree wins |

## Release Commands

```powershell
npm run lint
$env:VITE_APP_BUILD_ID='cut-os-10-final'; npm run build
npm run test:bundle
npm run test:history-import:corpus
npm run test:daily-guardrails
npm run test:mistake-proof-log
npm run test:surface-consistency
npm run test:unit
npx playwright test tests/e2e --config=playwright.config.ts
npm run test:release
```

Release requires 0 lint warnings, 0 Vite chunk warnings, passing bundle budgets, passing unit tests, and passing Playwright E2E.
Paid release signoff also requires the physical-device evidence in `docs/device-qa-runbook.md` and release hygiene: unknown untracked source files must be staged, ignored, or explicitly documented before handoff.
