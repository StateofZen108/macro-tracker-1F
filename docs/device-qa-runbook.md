# Device QA Runbook

Physical-device QA is required before a paid Cut OS release is called green. Playwright proves the app shell; this runbook proves browser/device APIs that emulators and headless browsers do not exercise reliably.

## Required Evidence

Each run must record:

- Build ID and git SHA.
- Date, tester, device model, OS version, browser, and install mode.
- One result row per check with `passed` or `failed`.
- Evidence as a screenshot path, short video path, exported diagnostics file, or exact note explaining a browser limitation plus the fallback that passed.

Use this result shape when recording evidence:

```ts
type DeviceQaResult = {
  checkedAt: string
  device: 'physical_android' | 'physical_ios'
  browser: string
  checks: Array<{ id: string; status: 'passed' | 'failed'; evidence: string }>
}
```

## Required Checks

| ID | Path | Acceptance |
|---|---|---|
| `camera_permission_denied` | Open barcode scan, deny camera permission | App shows fallback/manual barcode path; logging remains usable; no blank screen |
| `barcode_permission_granted` | Grant camera permission and scan a physical barcode | Scan reaches a result or explicit fallback; sheet remains dismissable |
| `barcode_manual_fallback` | Enter barcode manually after camera failure | Lookup/import path remains usable or shows provider error with recovery copy |
| `ocr_capture_save` | Capture/upload nutrition label and save reviewed food | Reviewed food saves, appears in food database, and can be logged |
| `pwa_install_reopen` | Install PWA, close browser/app, reopen from icon | App shell opens on the installed target without white screen |
| `offline_reopen_log` | Disable network, reopen installed app, log a food/Quick Add | Offline badge appears and local logging succeeds |
| `discard_dialog_hit_test` | Dirty custom food/OCR form, close, keep editing, close, discard | Dialog buttons are center-hittable and focus does not escape behind the sheet |

## Release Rule

`device_qa_green` passes only when all required checks pass on at least one physical Android or iOS device for the candidate build. A blocked API can pass only when the limitation is browser-documented in the evidence row and the equivalent fallback check passes on the same build.

Any failed check keeps the release red until the fix lands and this runbook is repeated against the new build.
