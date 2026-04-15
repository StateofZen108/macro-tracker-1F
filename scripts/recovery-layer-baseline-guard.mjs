import { runWaveBaselineGuard } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'recovery-layer',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic recovery replay artifact is wired into the build.',
}

runWaveBaselineGuard({
  label: 'recovery-layer-baseline-guard',
  baselinePath: 'tests/fixtures/recovery-layer-replay-baseline.json',
  canonicalArtifact,
  allowedExactChanges: ['scripts/recovery-layer-baseline-guard.mjs', 'scripts/run-recovery-layer-baseline-update.mjs', 'package.json'],
})
