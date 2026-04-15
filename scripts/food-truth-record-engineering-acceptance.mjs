import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  PRODUCTION_LIKE_ENV,
  computeFoodTruthFingerprint,
  createPendingEngineeringAcceptance,
  engineeringAcceptancePath,
  readAppVersion,
  repoRoot,
  writeJson,
} from './food-truth-readiness-shared.mjs'

const defaultPort = 4176

function fail(message) {
  console.error(`food-truth-record-engineering-acceptance: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    port: defaultPort,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port') {
      const parsed = Number.parseInt(`${argv[index + 1] ?? ''}`, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        fail('--port must be a positive integer.')
      }
      args.port = parsed
      index += 1
      continue
    }
    fail(`unsupported argument "${arg}".`)
  }

  return args
}

function waitForExit(childProcess) {
  return new Promise((resolve) => {
    childProcess.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })
}

async function waitForUrl(url, timeoutMs = 180000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep waiting until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  fail(`preview server did not become ready at ${url} within ${timeoutMs / 1000}s.`)
}

function startPreviewServer(port) {
  const previewProcess = spawn(process.execPath, ['scripts/run-food-truth-wave1-preview.mjs', `${port}`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...PRODUCTION_LIKE_ENV,
      FOOD_TRUTH_WAVE1_PREVIEW_PORT: `${port}`,
    },
    stdio: 'inherit',
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      previewProcess.kill(signal)
    })
  }

  return previewProcess
}

async function loadScenarioModule() {
  const moduleUrl = new URL('../tests/e2e/helpers/foodTruth.ts', import.meta.url).href
  return import(moduleUrl)
}

function writeFailedAcceptance(errorMessage) {
  const payload = createPendingEngineeringAcceptance()
  payload.status = 'failed'
  payload.executedAt = new Date().toISOString()
  payload.appVersion = readAppVersion()
  payload.inputFingerprint = computeFoodTruthFingerprint({ includeEngineeringFiles: true })
  payload.notes = errorMessage
  writeJson(engineeringAcceptancePath, payload)
}

async function main() {
  const { port } = parseArgs(process.argv.slice(2))
  const previewUrl = `http://127.0.0.1:${port}`
  const previewProcess = startPreviewServer(port)
  let browser = null

  try {
    await waitForUrl(previewUrl)
    const { WAVE1_ACCEPTANCE_SCENARIOS } = await loadScenarioModule()
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      baseURL: previewUrl,
      viewport: { width: 1440, height: 1080 },
    })

    const scenarioResults = {}
    let overallStatus = 'automated_passed'

    for (const scenario of WAVE1_ACCEPTANCE_SCENARIOS) {
      const page = await context.newPage()
      try {
        await scenario.run(page)
        scenarioResults[scenario.id] = {
          status: 'passed',
          notes: '',
        }
      } catch (error) {
        overallStatus = 'failed'
        scenarioResults[scenario.id] = {
          status: 'failed',
          notes: error instanceof Error ? error.message : `${error}`,
        }
      } finally {
        await page.close().catch(() => undefined)
      }
    }

    const payload = {
      status: overallStatus,
      executedAt: new Date().toISOString(),
      buildMode: 'production_like',
      appVersion: readAppVersion(),
      inputFingerprint: computeFoodTruthFingerprint({ includeEngineeringFiles: true }),
      notes:
        overallStatus === 'automated_passed'
          ? 'Automated Wave 1 engineering acceptance passed.'
          : 'One or more automated Wave 1 engineering acceptance scenarios failed.',
      scenarios: scenarioResults,
    }
    writeJson(engineeringAcceptancePath, payload)

    if (overallStatus !== 'automated_passed') {
      process.exitCode = 1
      return
    }

    console.log('FOOD_TRUTH_ENGINEERING_ACCEPTANCE_OK')
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    previewProcess.kill('SIGTERM')
    await waitForExit(previewProcess)
  }
}

main().catch((error) => {
  writeFailedAcceptance(error instanceof Error ? error.message : `${error}`)
  fail(error instanceof Error ? error.message : `${error}`)
})
