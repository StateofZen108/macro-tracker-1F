import { runWaveBaselineUpdate } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'psmf-garmin',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic combined replay artifact is wired into the build.',
}

runWaveBaselineUpdate({
  label: 'psmf-garmin-baseline-update',
  baselinePath: 'tests/fixtures/psmf-garmin-replay-baseline.json',
  canonicalArtifact,
  updateEnvVar: 'ALLOW_PSMF_GARMIN_BASELINE_UPDATE',
})
