import { runWaveBaselineGuard } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'psmf-garmin',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic combined replay artifact is wired into the build.',
}

runWaveBaselineGuard({
  label: 'psmf-garmin-baseline-guard',
  baselinePath: 'tests/fixtures/psmf-garmin-replay-baseline.json',
  canonicalArtifact,
  allowedExactChanges: ['scripts/psmf-garmin-baseline-guard.mjs', 'scripts/run-psmf-garmin-baseline-update.mjs', 'package.json'],
})
