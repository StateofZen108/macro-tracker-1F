import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const desiredStatePath = path.join(
  repoRoot,
  '.github',
  'branch-protection',
  'food-truth-required-checks.json',
)
const manifestPath = path.join(repoRoot, 'tests', 'fixtures', 'food-truth', 'manifest.json')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readDesiredState() {
  if (!fs.existsSync(desiredStatePath)) {
    fail(`sync-food-truth-branch-protection: missing desired-state file at ${desiredStatePath}.`)
  }
  const desiredState = JSON.parse(fs.readFileSync(desiredStatePath, 'utf8'))
  if (
    desiredState.branch !== 'main' ||
    desiredState.mode !== 'union' ||
    !Array.isArray(desiredState.requiredChecksMustInclude)
  ) {
    fail('sync-food-truth-branch-protection: desired-state file does not match the locked schema.')
  }
  return desiredState
}

function getRepository() {
  return process.env.BRANCH_PROTECTION_REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? ''
}

function getToken() {
  return process.env.BRANCH_PROTECTION_ADMIN_TOKEN?.trim() ?? ''
}

async function githubRequest(repository, token, method, suffix, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${suffix}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'food-truth-branch-protection-sync',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text()
    fail(`sync-food-truth-branch-protection: GitHub API ${method} ${suffix} failed with ${response.status}: ${errorText}`)
  }

  return response.status === 204 ? null : response.json()
}

function actorNames(entries, keys) {
  if (!Array.isArray(entries)) {
    return []
  }
  return entries.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    for (const key of keys) {
      if (typeof entry[key] === 'string' && entry[key].trim()) {
        return [entry[key].trim()]
      }
    }
    return []
  })
}

function extractContexts(protection) {
  const contexts = new Set(protection?.required_status_checks?.contexts ?? [])
  for (const check of protection?.required_status_checks?.checks ?? []) {
    if (check && typeof check.context === 'string') {
      contexts.add(check.context)
    }
  }
  return [...contexts]
}

function buildProtectionPayload(currentProtection, desiredState) {
  const currentContexts = extractContexts(currentProtection)
  const nextContexts = [...new Set([...currentContexts, ...desiredState.requiredChecksMustInclude])].sort()
  const currentReviews = currentProtection?.required_pull_request_reviews
  const currentRestrictions = currentProtection?.restrictions

  return {
    required_status_checks: {
      strict: currentProtection?.required_status_checks?.strict ?? false,
      contexts: nextContexts,
    },
    enforce_admins: currentProtection?.enforce_admins?.enabled ?? false,
    required_pull_request_reviews: currentReviews
      ? {
          dismissal_restrictions: {
            users: actorNames(currentReviews.dismissal_restrictions?.users, ['login']),
            teams: actorNames(currentReviews.dismissal_restrictions?.teams, ['slug', 'name']),
            apps: actorNames(currentReviews.dismissal_restrictions?.apps, ['slug', 'name']),
          },
          dismiss_stale_reviews: currentReviews.dismiss_stale_reviews ?? false,
          require_code_owner_reviews: currentReviews.require_code_owner_reviews ?? false,
          required_approving_review_count: currentReviews.required_approving_review_count ?? 1,
          require_last_push_approval: currentReviews.require_last_push_approval ?? false,
          bypass_pull_request_allowances: {
            users: actorNames(currentReviews.bypass_pull_request_allowances?.users, ['login']),
            teams: actorNames(currentReviews.bypass_pull_request_allowances?.teams, ['slug', 'name']),
            apps: actorNames(currentReviews.bypass_pull_request_allowances?.apps, ['slug', 'name']),
          },
        }
      : null,
    restrictions: currentRestrictions
      ? {
          users: actorNames(currentRestrictions.users, ['login']),
          teams: actorNames(currentRestrictions.teams, ['slug', 'name']),
          apps: actorNames(currentRestrictions.apps, ['slug', 'name']),
        }
      : null,
    required_linear_history: currentProtection?.required_linear_history?.enabled ?? false,
    allow_force_pushes: currentProtection?.allow_force_pushes?.enabled ?? false,
    allow_deletions: currentProtection?.allow_deletions?.enabled ?? false,
    block_creations: currentProtection?.block_creations?.enabled ?? false,
    required_conversation_resolution:
      currentProtection?.required_conversation_resolution?.enabled ?? false,
    lock_branch: currentProtection?.lock_branch?.enabled ?? false,
    allow_fork_syncing: currentProtection?.allow_fork_syncing?.enabled ?? false,
  }
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'apply' && mode !== 'verify') {
    fail('sync-food-truth-branch-protection: use "apply" or "verify".')
  }

  const desiredState = readDesiredState()
  if (!fs.existsSync(manifestPath)) {
    const message =
      mode === 'apply'
        ? 'BRANCH_PROTECTION_SYNC_SKIPPED_NO_CORPUS'
        : 'BRANCH_PROTECTION_VERIFY_SKIPPED_NO_CORPUS'
    console.log(message)
    process.exit(0)
  }

  const repository = getRepository()
  const token = getToken()
  if (!repository) {
    fail('sync-food-truth-branch-protection: set BRANCH_PROTECTION_REPOSITORY or GITHUB_REPOSITORY.')
  }
  if (!token) {
    fail('sync-food-truth-branch-protection: BRANCH_PROTECTION_ADMIN_TOKEN is required once the benchmark corpus exists.')
  }

  const suffix = `/branches/${desiredState.branch}/protection`
  const currentProtection = await githubRequest(repository, token, 'GET', suffix)
  const currentContexts = extractContexts(currentProtection)
  const allPresent = desiredState.requiredChecksMustInclude.every((context) =>
    currentContexts.includes(context),
  )

  if (mode === 'verify') {
    if (!allPresent) {
      fail('sync-food-truth-branch-protection: required food-truth checks are not yet enforced on main.')
    }
    console.log('BRANCH_PROTECTION_VERIFY_OK')
    return
  }

  const payload = buildProtectionPayload(currentProtection, desiredState)
  await githubRequest(repository, token, 'PUT', suffix, payload)
  console.log('BRANCH_PROTECTION_SYNC_APPLIED')
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : `${error}`)
})
