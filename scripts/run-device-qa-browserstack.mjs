import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RESULT_PATH = (buildId) => resolve('test-results', 'device-qa', buildId, 'browserstack-device-qa-result.json')

export function buildBrowserStackCapabilities(env = process.env) {
  return {
    browserName: 'chrome',
    'bstack:options': {
      deviceName: env.BROWSERSTACK_DEVICE || 'Samsung Galaxy S22 Ultra',
      osVersion: env.BROWSERSTACK_OS_VERSION || '13.0',
      realMobile: 'true',
      projectName: 'Macro Tracker Production Proof',
      buildName: env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || 'unknown-build',
      sessionName: 'production-device-qa',
    },
  }
}

export function resolveBrowserStackDeviceQaPlan(env = process.env) {
  const buildId = env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  const errors = []
  if (!buildId) {
    errors.push('VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA is required.')
  }
  if (!env.PRODUCTION_BASE_URL) {
    errors.push('PRODUCTION_BASE_URL is required for BrowserStack device QA.')
  }
  if (!env.BROWSERSTACK_USERNAME || !env.BROWSERSTACK_ACCESS_KEY) {
    errors.push('BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are required for BrowserStack device QA.')
  }

  return {
    ok: errors.length === 0,
    buildId,
    capabilities: buildBrowserStackCapabilities(env),
    resultPath: buildId ? RESULT_PATH(buildId) : '',
    errors,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const plan = resolveBrowserStackDeviceQaPlan()
  if (!plan.ok) {
    for (const error of plan.errors) {
      console.error(error)
    }
    process.exit(1)
  }

  const sourcePath = process.env.BROWSERSTACK_DEVICE_QA_RESULT_SOURCE || process.env.DEVICE_QA_OPERATOR_EVIDENCE_JSON || process.env.DEVICE_QA_RESULT_SOURCE
  if (!sourcePath) {
    console.error('BrowserStack credentials are configured, but no completed real-device evidence JSON was supplied.')
    console.error('Set BROWSERSTACK_DEVICE_QA_RESULT_SOURCE after the real-device BrowserStack session captures camera/barcode/OCR/PWA/offline evidence.')
    process.exit(1)
  }
  if (!existsSync(sourcePath)) {
    console.error(`BrowserStack device QA evidence does not exist: ${sourcePath}`)
    process.exit(1)
  }

  mkdirSync(dirname(plan.resultPath), { recursive: true })
  copyFileSync(sourcePath, plan.resultPath)
  console.log(`BrowserStack device QA evidence captured: ${plan.resultPath}`)
}
