import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

const BASE_REF_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master']

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

function getChangedFiles() {
  const baseRef = BASE_REF_CANDIDATES.find(hasRef)
  if (!baseRef) {
    return []
  }

  const mergeBase = git(['merge-base', 'HEAD', baseRef])
  return git(['diff', '--name-only', `${mergeBase}...HEAD`])
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/\\/g, '/'))
    .filter(Boolean)
}

function isDisallowedBaselineCoChange(filePath) {
  return (
    filePath.startsWith('src/') ||
    filePath.startsWith('server/') ||
    filePath.startsWith('api/') ||
    filePath.startsWith('tests/e2e/') ||
    /^playwright.*\.ts$/i.test(basename(filePath))
  )
}

function isAllowedBaselineOnlyChange(filePath, allowedExactChanges, allowedPrefixes) {
  return (
    allowedExactChanges.has(filePath) ||
    allowedPrefixes.some((prefix) => filePath.startsWith(prefix))
  )
}

function ensureCanonicalArtifact({
  baselinePath,
  canonicalArtifact,
  label,
}) {
  const expected = `${JSON.stringify(canonicalArtifact, null, 2)}\n`
  const committed = readFileSync(baselinePath, 'utf8')

  if (committed !== expected) {
    throw new Error(
      `${label}: committed baseline artifact does not match the canonical artifact. Run the dedicated update command.`,
    )
  }
}

export function runWaveBaselineGuard({
  label,
  baselinePath,
  canonicalArtifact,
  allowedExactChanges = [],
  allowedPrefixes = ['tests/unit/'],
}) {
  const normalizedBaselinePath = baselinePath.replace(/\\/g, '/')
  const allowedExact = new Set(
    [normalizedBaselinePath, ...allowedExactChanges].map((value) => value.replace(/\\/g, '/')),
  )
  const baseCandidates = BASE_REF_CANDIDATES.filter(hasRef)
  const baseRef = baseCandidates[0]

  if (!baseRef) {
    console.log(`${label}: no base branch available, skipping guard.`)
    ensureCanonicalArtifact({ baselinePath, canonicalArtifact, label })
    return
  }

  const mergeBase = git(['merge-base', 'HEAD', baseRef])
  const changedFiles = git(['diff', '--name-only', `${mergeBase}...HEAD`])
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/\\/g, '/'))
    .filter(Boolean)
  const baselineChanged = changedFiles.includes(normalizedBaselinePath)
  const baselineExistsOnMainline = fileExistsAtRef(mergeBase, normalizedBaselinePath)

  if (baselineChanged) {
    if (baselineExistsOnMainline) {
      if (changedFiles.some(isDisallowedBaselineCoChange)) {
        throw new Error(
          `${label}: baseline artifact changed alongside source, server, api, e2e, or Playwright config files.`,
        )
      }

      if (
        !changedFiles.every((filePath) =>
          isAllowedBaselineOnlyChange(filePath, allowedExact, allowedPrefixes),
        )
      ) {
        throw new Error(
          `${label}: baseline updates are restricted to the baseline artifact, allowed tests, guard scripts, and command wiring.`,
        )
      }
    }
  }

  ensureCanonicalArtifact({ baselinePath, canonicalArtifact, label })
  console.log(`${label}: baseline artifact matches the canonical artifact.`)
}

export function runWaveBaselineUpdate({
  label,
  baselinePath,
  canonicalArtifact,
  updateEnvVar,
}) {
  if (process.env[updateEnvVar] !== '1') {
    throw new Error(`Set ${updateEnvVar}=1 before updating the ${label} baseline.`)
  }

  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, `${JSON.stringify(canonicalArtifact, null, 2)}\n`, 'utf8')
  console.log(`${label}: baseline artifact updated.`)
}
