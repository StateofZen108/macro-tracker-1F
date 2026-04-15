import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const repoRoot = process.cwd()
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const manualAcceptancePath = path.join(fixturesDir, 'wave1-manual-acceptance.json')
const packageJsonPath = path.join(repoRoot, 'package.json')
const defaultPort = 4176

function fail(message) {
  console.error(`food-truth-record-wave1-acceptance: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    operator: '',
    port: defaultPort,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--operator') {
      args.operator = `${argv[index + 1] ?? ''}`.trim()
      index += 1
      continue
    }
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

function resolveOperator(explicitOperator) {
  if (explicitOperator) {
    return explicitOperator
  }

  try {
    const gitName = execFileSync('git', ['config', 'user.name'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitName) {
      return gitName
    }
  } catch {
    // Ignore and continue to environment fallback.
  }

  const envOperator = process.env.USERNAME?.trim() || process.env.USER?.trim()
  if (envOperator) {
    return envOperator
  }

  fail('operator name is required; use --operator or configure git user.name.')
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
      MODE: 'production',
      VITE_FF_IMPORT_TRUST_V1: 'true',
      VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
      VITE_FF_LABEL_OCR_TRUST_V1: 'true',
      VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'false',
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

async function promptScenarioDecision(rl, scenarioId) {
  while (true) {
    const decision = (await rl.question(`food-truth ${scenarioId}: pass/fail? `)).trim().toLowerCase()
    if (decision === 'pass' || decision === 'passed') {
      const notes = await rl.question(`food-truth ${scenarioId}: notes (optional): `)
      return {
        status: 'passed',
        notes: notes.trim(),
      }
    }
    if (decision === 'fail' || decision === 'failed') {
      const notes = await rl.question(`food-truth ${scenarioId}: failure notes: `)
      return {
        status: 'failed',
        notes: notes.trim(),
      }
    }
    console.log('Enter "pass" or "fail".')
  }
}

function readAppVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return typeof packageJson.version === 'string' && packageJson.version.trim()
    ? packageJson.version.trim()
    : null
}

function writeManualAcceptance(payload) {
  fs.writeFileSync(manualAcceptancePath, `${JSON.stringify(payload, null, 2)}\n`)
}

async function loadScenarioModule() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'tests', 'e2e', 'helpers', 'foodTruth.ts')).href
  return import(moduleUrl)
}

async function main() {
  const { operator: explicitOperator, port } = parseArgs(process.argv.slice(2))
  const operator = resolveOperator(explicitOperator)
  const previewUrl = `http://127.0.0.1:${port}`
  const previewProcess = startPreviewServer(port)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  let browser = null

  try {
    await waitForUrl(previewUrl)
    const { WAVE1_ACCEPTANCE_SCENARIOS } = await loadScenarioModule()
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({
      baseURL: previewUrl,
      viewport: { width: 1440, height: 1080 },
    })

    const scenarioResults = {}
    let overallStatus = 'approved'

    for (const scenario of WAVE1_ACCEPTANCE_SCENARIOS) {
      const page = await context.newPage()
      try {
        await scenario.run(page)
        const decision = await promptScenarioDecision(rl, scenario.id)
        scenarioResults[scenario.id] = decision
        if (decision.status !== 'passed') {
          overallStatus = 'rejected'
        }
      } catch (error) {
        overallStatus = 'rejected'
        scenarioResults[scenario.id] = {
          status: 'failed',
          notes: error instanceof Error ? error.message : `${error}`,
        }
      } finally {
        await page.close().catch(() => undefined)
      }
    }

    const notes =
      overallStatus === 'approved'
        ? 'Wave 1 manual acceptance passed in the guided preview run.'
        : 'One or more Wave 1 manual acceptance scenarios failed.'

    writeManualAcceptance({
      status: overallStatus,
      executedAt: new Date().toISOString(),
      executedBy: [operator],
      buildMode: 'production_like',
      appVersion: readAppVersion(),
      notes,
      scenarios: scenarioResults,
    })

    if (overallStatus !== 'approved') {
      process.exitCode = 1
    }
  } finally {
    rl.close()
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    previewProcess.kill('SIGTERM')
    await waitForExit(previewProcess)
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : `${error}`)
})
