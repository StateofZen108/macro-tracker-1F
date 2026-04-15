import { runWaveBaselineUpdate } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'psmf-phase',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic phase replay artifact is wired into the build.',
}

runWaveBaselineUpdate({
  label: 'psmf-phase-baseline-update',
  baselinePath: 'tests/fixtures/psmf-phase-replay-baseline.json',
  canonicalArtifact,
  updateEnvVar: 'ALLOW_PSMF_PHASE_BASELINE_UPDATE',
})
