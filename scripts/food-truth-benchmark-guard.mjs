import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

const benchmarkPrefix = 'tests/fixtures/food-truth/'
const allowedBenchmarkSupportChanges = new Set([
  'package.json',
  '.github/workflows/ci.yml',
  '.github/workflows/food-truth-branch-protection.yml',
  '.github/workflows/food-truth-wave1-launch.yml',
  '.github/branch-protection/food-truth-required-checks.json',
  'scripts/food-truth-build-candidates.mjs',
  'scripts/food-truth-benchmark.mjs',
  'scripts/food-truth-benchmark-guard.mjs',
  'scripts/food-truth-capture-real-corpus.mjs',
  'scripts/food-truth-engineering-gate.mjs',
  'scripts/food-truth-promote-synthetic-corpus.mjs',
  'scripts/food-truth-readiness-shared.mjs',
  'scripts/food-truth-record-engineering-acceptance.mjs',
  'scripts/food-truth-update-benchmark.mjs',
  'scripts/food-truth-record-wave1-acceptance.mjs',
  'scripts/food-truth-wave1-launch-gate.mjs',
  'scripts/run-food-truth-wave1-preview.mjs',
  'scripts/sync-food-truth-branch-protection.mjs',
  'playwright.food-truth-wave1.config.ts',
  'tests/e2e/preview/food-truth-wave1.preview.spec.ts',
  'tests/e2e/helpers/foodTruth.ts',
])

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function hasRef(ref) {
  try {
    git(['rev-parse', '--verify', ref])
    return true
  } catch {
    return false
  }
}

function isBenchmarkArtifact(filePath) {
  return filePath.startsWith(benchmarkPrefix)
}

function isDisallowedBenchmarkCoChange(filePath) {
  if (allowedBenchmarkSupportChanges.has(filePath)) {
    return false
  }
  return (
    filePath.startsWith('src/') ||
    filePath.startsWith('server/') ||
    filePath.startsWith('api/') ||
    filePath.startsWith('tests/e2e/') ||
    /^playwright.*\.ts$/i.test(basename(filePath))
  )
}

function isAllowedBenchmarkOnlyChange(filePath) {
  return isBenchmarkArtifact(filePath) || allowedBenchmarkSupportChanges.has(filePath)
}

const baseCandidates = ['origin/main', 'origin/master', 'main', 'master']
const baseRef = baseCandidates.find(hasRef)

if (!baseRef) {
  console.log('food-truth-benchmark-guard: no base branch available, skipping guard.')
  process.exit(0)
}

const mergeBase = git(['merge-base', 'HEAD', baseRef])
const changedFiles = git(['diff', '--name-only', `${mergeBase}...HEAD`])
  .split(/\r?\n/)
  .map((value) => value.trim().replace(/\\/g, '/'))
  .filter(Boolean)

const benchmarkChanged = changedFiles.some(isBenchmarkArtifact)
if (!benchmarkChanged) {
  console.log('food-truth-benchmark-guard: no benchmark artifact changes detected.')
  process.exit(0)
}

if (changedFiles.some(isDisallowedBenchmarkCoChange)) {
  console.error(
    'food-truth-benchmark-guard: benchmark artifacts changed alongside source, server, api, e2e, or Playwright config files.',
  )
  process.exit(1)
}

if (!changedFiles.every(isAllowedBenchmarkOnlyChange)) {
  console.error(
    'food-truth-benchmark-guard: benchmark updates are restricted to benchmark artifacts, benchmark scripts, and CI/package wiring.',
  )
  process.exit(1)
}

console.log('food-truth-benchmark-guard: benchmark artifact changes are isolated.')
