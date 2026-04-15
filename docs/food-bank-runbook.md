# Food Bank OCR Runbook

Use this runbook on `codex/integration-preview-2026-04-15` while you build your real saved-food bank.

## OCR startup on this machine

1. Install dependencies:
   - `npm install`
2. Create local `.env` with one server-side OCR key:
   - `GEMINI_API_KEY=...`
   - or `GOOGLE_API_KEY=...`
3. Install Vercel CLI once:
   - `npm i -g vercel`
4. If needed, authenticate once:
   - `vercel login --github`
5. Start the OCR-capable runtime:
   - `npm run dev:ocr`
6. Use the app at:
   - `http://127.0.0.1:3000`

Do not use `npm run dev` for OCR sessions. It does not serve `/api/label-ocr/extract`.

## OCR health check

Before a real OCR session:

1. Save one real nutrition-label image to:
   - `C:\Users\deepp\Downloads\MF\tmp\ocr-healthcheck.jpg`
2. Run:
   - `npm run health:ocr`

The check passes only if the OCR route returns:
- `provider=gemini`
- `status=success`
- `session`
- `fields`
- `warnings[]`

If the check fails, do not use OCR in the UI for that session.

## Daily backup discipline

- Before the first capture session each day, export a backup from Settings.
- After any session that creates or edits reviewed foods or meaningful logs, export again immediately.
- Before switching branches, pulling new code, reinstalling dependencies, clearing site data, or changing browser/profile/device, export a fresh backup first.
- Use `replace`, not `merge`, when restoring your own dataset into another build.
- Keep at least the last 3 exported backups outside the repo folder.

## Restore-test environment for cutover

Use this exact environment before moving off the integration branch:

- device: this desktop machine
- browser: Chrome
- profile: brand-new Chrome profile
- app URL: `http://127.0.0.1:4173`

Start the cleaned branch with:

1. `npm run build`
2. `npm run preview:restore-test`

Then:

1. open `http://127.0.0.1:4173` in the new Chrome profile
2. import the final integration backup with `replace`
3. run the acceptance checklist below

If the restore test fails, keep using the integration branch and do not manually repair local browser storage.

## Acceptance checklist

Initial proof:

1. Start OCR with `npm run dev:ocr`
2. Pass `npm run health:ocr`
3. Save 5 real OCR foods from 5 clear nutrition-label photos
4. Log each of those 5 foods to a meal at least once
5. Export a backup
6. Restore that backup into the cleaned branch using `replace`
7. Verify all 5 foods and their log entries still exist

Daily-use proof:

1. Reuse 2 of those 5 foods from saved foods without OCR
2. Each reuse must:
   - skip photo selection
   - skip OCR wait
   - skip review correction
   - complete in 30 seconds or less
   - take 6 or fewer intentional actions after Add Food opens

That is the minimum proof that the saved-food bank is actually making repeated logging faster.
