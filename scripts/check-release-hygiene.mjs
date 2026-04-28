import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const IGNORED_PREFIXES = [
  'dist/',
  'test-results/',
  'tmp/',
  'node_modules/',
  'supabase/.temp/',
]

const IGNORED_FILES = new Set([
  '.env',
])

export function parsePorcelainStatus(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2)
      const path = line.slice(3)
      return { status, path }
    })
}

export function isIgnoredReleaseArtifact(path) {
  const normalized = path.replace(/\\/g, '/')
  return IGNORED_FILES.has(normalized) || IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function findReleaseHygieneViolations(entries, env = process.env) {
  const violations = []
  const buildId = env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  if (!buildId) {
    violations.push('Missing VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
  }

  for (const entry of entries) {
    if (isIgnoredReleaseArtifact(entry.path)) {
      continue
    }

    if (entry.status === '??') {
      violations.push(`Unknown untracked source artifact: ${entry.path}`)
      continue
    }

    violations.push(`Tracked source change is not committed: ${entry.path}`)
  }

  return violations
}

function readGitStatus() {
  return execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = findReleaseHygieneViolations(parsePorcelainStatus(readGitStatus()))
  if (violations.length) {
    console.error('Release hygiene check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Release hygiene verified.')
}
