import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  QA_LANE_CONFIGS,
  QA_SCENARIO_CATALOG,
  loadJsonFile,
  validateQaScenarioCatalog,
  writeJsonFile,
} from './qa-release/shared.mjs'

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      continue
    }

    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      values[key] = true
      continue
    }

    values[key] = next
    index += 1
  }
  return values
}

function getPlaywrightInvocation(args) {
  return process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npx.cmd', 'playwright', ...args],
      }
    : {
        command: 'npx',
        args: ['playwright', ...args],
      }
}

function runCommand(invocation, options = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: 'inherit',
    })

    child.on('exit', (code, signal) => {
      resolve({
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: typeof code === 'number' ? code : null,
        signal: signal ?? null,
      })
    })

    child.on('error', (error) => {
      console.error(error.message)
      resolve({
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: null,
        signal: 'spawn_error',
      })
    })
  })
}

function collectScenarioResults(resultsDir) {
  if (!fs.existsSync(resultsDir)) {
    return []
  }

  return fs
    .readdirSync(resultsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => loadJsonFile(path.join(resultsDir, fileName), null))
    .filter(Boolean)
}

function resolveCommitSha() {
  try {
    const file = fs.readFileSync('.git/HEAD', 'utf8').trim()
    if (file.startsWith('ref:')) {
      const refPath = file.slice(5).trim()
      return fs.readFileSync(path.join('.git', refPath), 'utf8').trim()
    }
    return file
  } catch {
    return 'unknown'
  }
}

const args = parseArgs(process.argv.slice(2))
const runRoot =
  typeof args.outputDir === 'string'
    ? path.resolve(args.outputDir)
    : path.resolve(process.cwd(), 'test-results', 'qa-release-gate')
const inputPath = path.join(runRoot, 'qa-evaluator-input.json')
const outputPath =
  typeof args.output === 'string'
    ? path.resolve(args.output)
    : path.join(runRoot, 'qa-run-artifact.json')
const manualFindingsPath =
  typeof args['manual-findings'] === 'string' ? path.resolve(args['manual-findings']) : null
const accessibilityAllowlistPath =
  typeof args.allowlist === 'string'
    ? path.resolve(args.allowlist)
    : path.resolve(process.cwd(), 'tests', 'fixtures', 'qa', 'accessibility-allowlist.json')

fs.mkdirSync(runRoot, { recursive: true })

const catalogValidation = validateQaScenarioCatalog(QA_SCENARIO_CATALOG)
if (!catalogValidation.ok) {
  writeJsonFile(outputPath, {
    buildId: args.buildId ?? 'qa-release-gate-invalid-catalog',
    commitSha: resolveCommitSha(),
    generatedAt: new Date().toISOString(),
    verdict: 'fail',
    errors: catalogValidation.errors,
  })
  process.exit(1)
}

const requiredLaneIds = [
  ...new Set(
    QA_SCENARIO_CATALOG.filter((scenario) => scenario.releaseClass === 'required').flatMap(
      (scenario) => scenario.requiredLanes,
    ),
  ),
]
const laneQueue = ['dev_smoke', ...requiredLaneIds.filter((laneId) => laneId !== 'dev_smoke')]
const laneResults = []
const scenarioResults = []

for (const laneId of laneQueue) {
  const laneConfig = QA_LANE_CONFIGS[laneId]
  if (!laneConfig) {
    laneResults.push({
      laneId,
      advisory: false,
      status: 'aborted',
      evidencePaths: [],
    })
    continue
  }

  const laneResultsDir = path.join(runRoot, 'raw', laneId)
  fs.mkdirSync(laneResultsDir, { recursive: true })
  const playwrightInvocation = getPlaywrightInvocation([
    'test',
    `--config=${laneConfig.configFile}`,
  ])

  const execution = await runCommand(playwrightInvocation, {
    env: {
      ...process.env,
      QA_RELEASE_RESULTS_DIR: laneResultsDir,
      QA_RELEASE_LANE_ID: laneId,
      QA_ACCESSIBILITY_ALLOWLIST_PATH: accessibilityAllowlistPath,
    },
  })

  laneResults.push({
    laneId,
    advisory: laneConfig.advisory,
    status:
      execution.signal && execution.signal !== null
        ? 'aborted'
        : execution.exitCode === 0
          ? 'passed'
          : 'failed',
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    exitCode: execution.exitCode ?? undefined,
    evidencePaths: [],
  })

  scenarioResults.push(...collectScenarioResults(laneResultsDir))
}

const evaluatorInput = {
  buildId:
    typeof args.buildId === 'string'
      ? args.buildId
      : `qa-release-gate-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  commitSha: resolveCommitSha(),
  evaluationDate: new Date().toISOString().slice(0, 10),
  scenarioCatalog: QA_SCENARIO_CATALOG,
  laneResults,
  scenarioResults,
  findings: [],
  manualSweep: manualFindingsPath ? loadJsonFile(manualFindingsPath, null) : null,
}

writeJsonFile(inputPath, evaluatorInput)

const evaluatorInvocation = {
  command: process.execPath,
  args: ['scripts/qa-severity-evaluator.mjs', '--input', inputPath, '--output', outputPath],
}

const evaluatorExecution = await runCommand(evaluatorInvocation)
process.exit(evaluatorExecution.exitCode ?? 1)
