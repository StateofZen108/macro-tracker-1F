import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPORT_PATH = resolve('tmp', 'preview-feature-parity-report.json')
const PAID_CUT_OS_PREVIEW_PRESET = 'paid-cut-os-preview'
const REQUIRED_TRUE_FLAGS = [
  'premiumUiV1',
  'premiumLogSummaryV2',
  'premiumFastLogToolbarV2',
  'premiumMealLedgerV2',
  'personalLibraryV1',
  'paidCutOsV1',
  'cutOsImportFocusV1',
  'coachProofAnswerV1',
  'standaloneCutNineV1',
  'foodTrustConfidenceV3',
  'firstTenMinuteActivationV1',
  'coachProofDefaultV2',
  'cutOsReplayValidationV1',
  'macroFactorSurpassV1',
  'unifiedLoggerV1',
  'foodDatabaseTrustV1',
  'mistakeProofCutV1',
  'dailyGuardrailsV1',
  'foodTrustRepairV1',
  'coachMistakeProofV1',
  'surfaceConsistencyGuardV1',
]
const REQUIRED_FALSE_FLAGS = ['aiMealCaptureV1']

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
}

function isProtectionPage({ status = 0, url = '', body = '' } = {}) {
  const normalized = body.toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    url.includes('vercel.com/sso') ||
    normalized.includes('vercel authentication') ||
    normalized.includes('deployment protection') ||
    normalized.includes('continue with vercel')
  )
}

export async function runPreviewFeatureParity({ env = process.env } = {}) {
  const previewUrl = env.VERCEL_PREVIEW_URL?.trim() || env.PRODUCTION_BASE_URL?.trim() || ''
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || ''
  const expectedPreset = env.VITE_APP_FEATURE_PRESET?.trim() || PAID_CUT_OS_PREVIEW_PRESET
  const report = {
    checkedAt: new Date().toISOString(),
    previewUrl,
    expectedPreset,
    status: 'failed',
    failures: [],
    requiredTrueFlags: REQUIRED_TRUE_FLAGS,
    requiredFalseFlags: REQUIRED_FALSE_FLAGS,
  }

  if (!previewUrl) {
    report.failures.push('VERCEL_PREVIEW_URL or PRODUCTION_BASE_URL is required.')
    writeReport(report)
    return report
  }

  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : undefined,
    })
    const page = await context.newPage()
    const response = await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const body = await page.content()
    if (isProtectionPage({ status: response?.status() ?? 0, url: page.url(), body })) {
      report.status = 'blocked_by_protection'
      report.failures.push(
        bypassSecret
          ? 'Preview returned Vercel Deployment Protection even with the bypass header.'
          : 'Preview is protected and VERCEL_AUTOMATION_BYPASS_SECRET is not configured.',
      )
      writeReport(report)
      return report
    }

    await page.waitForSelector('#root', { timeout: 15000 })
    const featureState = await page.evaluate(() => window.__MT_FEATURE_FLAGS__ ?? null)
    report.featureState = featureState
    if (!featureState?.flags) {
      report.failures.push('Preview did not expose window.__MT_FEATURE_FLAGS__.')
      writeReport(report)
      return report
    }

    if (featureState.preset !== expectedPreset) {
      report.failures.push(`Feature preset mismatch: expected ${expectedPreset}, got ${featureState.preset ?? '<none>'}.`)
    }

    for (const flag of REQUIRED_TRUE_FLAGS) {
      if (featureState.flags[flag] !== true) {
        report.failures.push(`Expected ${flag}=true, got ${String(featureState.flags[flag])}.`)
      }
    }

    for (const flag of REQUIRED_FALSE_FLAGS) {
      if (featureState.flags[flag] !== false) {
        report.failures.push(`Expected ${flag}=false, got ${String(featureState.flags[flag])}.`)
      }
    }

    report.status = report.failures.length === 0 ? 'passed' : 'failed'
    writeReport(report)
    return report
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreviewFeatureParity()
    .then((report) => {
      if (report.status === 'passed') {
        console.log(`Preview feature parity passed: ${report.previewUrl}`)
        return
      }

      console.error(`Preview feature parity ${report.status}:`)
      for (const failure of report.failures) {
        console.error(`- ${failure}`)
      }
      process.exit(1)
    })
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      writeReport({
        checkedAt: new Date().toISOString(),
        status: 'failed',
        reason,
      })
      console.error(`Preview feature parity failed: ${reason}`)
      process.exit(1)
    })
}
