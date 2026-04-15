import { runWaveBaselineGuard } from './baseline-utils.mjs'

const canonicalArtifact = {
  schemaVersion: 1,
  wave: 'psmf-phase',
  kind: 'placeholder-replay-baseline',
  note: 'Canonical placeholder until a deterministic phase replay artifact is wired into the build.',
}

runWaveBaselineGuard({
  label: 'psmf-phase-baseline-guard',
  baselinePath: 'tests/fixtures/psmf-phase-replay-baseline.json',
  canonicalArtifact,
  allowedExactChanges: ['scripts/psmf-phase-baseline-guard.mjs', 'scripts/run-psmf-phase-baseline-update.mjs', 'package.json'],
})
