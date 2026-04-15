import { runWaveBaselineUpdate } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'recovery-layer',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic recovery replay artifact is wired into the build.',
}

runWaveBaselineUpdate({
  label: 'recovery-layer-baseline-update',
  baselinePath: 'tests/fixtures/recovery-layer-replay-baseline.json',
  canonicalArtifact,
  updateEnvVar: 'ALLOW_RECOVERY_LAYER_BASELINE_UPDATE',
})
