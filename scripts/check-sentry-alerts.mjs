import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RESULT_PATH = resolve('tmp', 'sentry-alerts-result.json')

export const DEFAULT_EXPECTED_ALERTS = [
  'new_issue',
  'api_5xx_spike',
  'ocr_failure_spike',
  'sync_failure_spike',
  'release_regression',
]

const ALERT_MATCHERS = {
  new_issue: ['new issue', 'new unresolved issue'],
  api_5xx_spike: ['api 5xx', '5xx', 'server error spike'],
  ocr_failure_spike: ['ocr failure', 'ocr'],
  sync_failure_spike: ['sync failure', 'sync'],
  release_regression: ['release regression', 'regression'],
}

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function normalizeExpectedAlertIds(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_EXPECTED_ALERTS
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function extractRuleText(rule) {
  const fragments = [
    rule?.id,
    rule?.name,
    rule?.label,
    rule?.actionMatch,
    ...(Array.isArray(rule?.conditions) ? rule.conditions.map((condition) => JSON.stringify(condition)) : []),
    ...(Array.isArray(rule?.actions) ? rule.actions.map((action) => JSON.stringify(action)) : []),
  ]

  return normalizeText(fragments.filter(Boolean).join(' '))
}

export function validateSentryAlertRules(rules, expectedAlertIds = DEFAULT_EXPECTED_ALERTS) {
  const normalizedRules = Array.isArray(rules) ? rules : []
  const ruleText = normalizedRules.map(extractRuleText)
  const missing = []

  for (const alertId of expectedAlertIds) {
    const matchers = ALERT_MATCHERS[alertId] ?? [alertId.replace(/_/g, ' ')]
    const found = ruleText.some((text) => matchers.some((matcher) => text.includes(matcher)))
    if (!found) {
      missing.push(alertId)
    }
  }

  return missing
}

export async function verifySentryAlerts(env = process.env, fetchImpl = fetch) {
  const expectedAlertIds = normalizeExpectedAlertIds(env.SENTRY_EXPECTED_ALERTS)
  const checkedAt = new Date().toISOString()

  if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG || !env.SENTRY_PROJECT) {
    if (truthy(env.SENTRY_ALERTS_VERIFIED)) {
      return {
        ok: true,
        checkedAt,
        verificationMode: 'manual_attestation',
        expectedAlertIds,
        alertsVerified: expectedAlertIds,
        missingAlertIds: [],
        reason: 'SENTRY_ALERTS_VERIFIED=true supplied without API credentials.',
      }
    }

    return {
      ok: false,
      checkedAt,
      verificationMode: 'api',
      expectedAlertIds,
      alertsVerified: [],
      missingAlertIds: expectedAlertIds,
      errors: [
        'Sentry alert verification requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT, or explicit SENTRY_ALERTS_VERIFIED=true manual attestation.',
      ],
    }
  }

  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(env.SENTRY_ORG)}/${encodeURIComponent(env.SENTRY_PROJECT)}/rules/`
  let response
  try {
    response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}`,
        Accept: 'application/json',
      },
    })
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      verificationMode: 'api',
      expectedAlertIds,
      alertsVerified: [],
      missingAlertIds: expectedAlertIds,
      errors: [`Sentry alert API request failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      checkedAt,
      verificationMode: 'api',
      expectedAlertIds,
      alertsVerified: [],
      missingAlertIds: expectedAlertIds,
      errors: [`Sentry alert API returned ${response.status}.`],
    }
  }

  const rules = await response.json()
  const missingAlertIds = validateSentryAlertRules(rules, expectedAlertIds)
  return {
    ok: missingAlertIds.length === 0,
    checkedAt,
    verificationMode: 'api',
    sentryOrg: env.SENTRY_ORG,
    sentryProject: env.SENTRY_PROJECT,
    expectedAlertIds,
    alertsVerified: expectedAlertIds.filter((id) => !missingAlertIds.includes(id)),
    missingAlertIds,
    errors: missingAlertIds.length ? [`Missing Sentry alert rules: ${missingAlertIds.join(', ')}.`] : [],
  }
}

function writeResult(result) {
  mkdirSync(dirname(RESULT_PATH), { recursive: true })
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await verifySentryAlerts()
  writeResult(result)
  if (!result.ok) {
    for (const error of result.errors ?? ['Sentry alert verification failed.']) {
      console.error(error)
    }
    process.exit(1)
  }

  console.log(`Sentry alert verification passed via ${result.verificationMode}.`)
}
