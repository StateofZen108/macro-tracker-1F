import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

const baselinePath = 'tests/fixtures/coaching-replay-baseline.json'
const baselinePathNormalized = baselinePath.replace(/\\/g, '/')
const allowedExactChanges = new Set([
  baselinePathNormalized,
  'scripts/run-coach-baseline-update.mjs',
  'scripts/coach-baseline-guard.mjs',
  'package.json',
])

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
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

function fileExistsAtRef(ref, filePath) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${filePath}`], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function isDisallowedBaselineCoChange(filePath) {
  return (
    filePath.startsWith('src/') ||
    filePath.startsWith('tests/e2e/') ||
    /^playwright.*\.ts$/i.test(basename(filePath))
  )
}

function isAllowedBaselineOnlyChange(filePath) {
  return allowedExactChanges.has(filePath) || filePath.startsWith('tests/unit/')
}

function getNpmInvocation(args) {
  return process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm.cmd', ...args],
      }
    : {
        command: 'npm',
        args,
      }
}

function recomputeBaselineArtifact(tempPath) {
  const npmInvocation = getNpmInvocation(['run', 'test:unit', '--', 'tests/unit/coaching.wave1.replay.spec.ts'])
  const result = spawnSync(
    npmInvocation.command,
    npmInvocation.args,
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        COACH_BASELINE_TEMP_PATH: tempPath,
      },
    },
  )

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error('Unable to recompute the coach replay baseline artifact from the v1 engine.')
  }
}

const baseCandidates = ['origin/main', 'origin/master', 'main', 'master']
const baseRef = baseCandidates.find(hasRef)

if (!baseRef) {
  console.log('coach-baseline-guard: no base branch available, skipping guard.')
  process.exit(0)
}

const mergeBase = git(['merge-base', 'HEAD', baseRef])
const changedFiles = git(['diff', '--name-only', `${mergeBase}...HEAD`])
  .split(/\r?\n/)
  .map((value) => value.trim().replace(/\\/g, '/'))
  .filter(Boolean)
const baselineChanged = changedFiles.includes(baselinePathNormalized)
const baselineExistsOnMainline = fileExistsAtRef(mergeBase, baselinePathNormalized)

if (baselineChanged) {
  if (!baselineExistsOnMainline) {
    console.log(
      'coach-baseline-guard: baseline artifact is being bootstrapped before it exists on mainline.',
    )
  } else {
    if (changedFiles.some(isDisallowedBaselineCoChange)) {
      console.error(
        'coach-baseline-guard: baseline artifact changed alongside source, e2e, or Playwright config files.',
      )
      process.exit(1)
    }

    if (!changedFiles.every(isAllowedBaselineOnlyChange)) {
      console.error(
        'coach-baseline-guard: baseline updates are restricted to replay/unit tests, guard scripts, and command wiring.',
      )
      process.exit(1)
    }
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'coach-baseline-guard-'))
const tempPath = join(tempDir, 'coaching-replay-baseline.json')

try {
  recomputeBaselineArtifact(tempPath)
  const committedBaseline = readFileSync(baselinePath)
  const recomputedBaseline = readFileSync(tempPath)

  if (Buffer.compare(committedBaseline, recomputedBaseline) !== 0) {
    console.error(
      'coach-baseline-guard: committed baseline artifact does not match the v1 replay output. Run the dedicated baseline update command.',
    )
    process.exit(1)
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('coach-baseline-guard: baseline artifact matches the v1 replay output.')
