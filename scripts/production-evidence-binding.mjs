export function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function isStrictExternalProof(env = process.env) {
  return isTruthy(env.PRODUCTION_STRICT_EXTERNAL_PROOF) || isTruthy(env.TEN_OUT_OF_TEN_REQUIRE_ALL)
}

export function normalizeSha(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function shaMatches(actual, expected) {
  const normalizedActual = normalizeSha(actual)
  const normalizedExpected = normalizeSha(expected)
  if (!normalizedActual || !normalizedExpected) {
    return false
  }
  return normalizedActual === normalizedExpected ||
    normalizedActual.startsWith(normalizedExpected) ||
    normalizedExpected.startsWith(normalizedActual)
}

export function resolveExpectedSourceGitSha(env = process.env, fallbackGitSha = null) {
  return env.PRODUCTION_SOURCE_GIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GIT_COMMIT_SHA ||
    fallbackGitSha ||
    null
}

export function validateEvidenceBinding(manifest, expected, label) {
  const violations = []
  const expectedBuildId = expected?.buildId
  const expectedSourceGitSha = expected?.sourceGitSha || expected?.gitSha
  const expectedEvidenceCommitSha = expected?.evidenceCommitSha
  const manifestSourceGitSha = manifest?.sourceGitSha || manifest?.gitSha

  if (manifest?.buildId !== expectedBuildId) {
    violations.push(`${label} buildId mismatch: expected ${expectedBuildId}, got ${manifest?.buildId ?? '<missing>'}.`)
  }

  if (!manifestSourceGitSha) {
    violations.push(`${label} sourceGitSha missing.`)
  } else if (expectedSourceGitSha && !shaMatches(manifestSourceGitSha, expectedSourceGitSha)) {
    violations.push(`${label} sourceGitSha mismatch: expected ${expectedSourceGitSha}, got ${manifestSourceGitSha}.`)
  }

  if (
    manifest?.evidenceCommitSha &&
    expectedEvidenceCommitSha &&
    !shaMatches(manifest.evidenceCommitSha, expectedEvidenceCommitSha)
  ) {
    violations.push(`${label} evidenceCommitSha mismatch: expected ${expectedEvidenceCommitSha}, got ${manifest.evidenceCommitSha}.`)
  }

  return violations
}
