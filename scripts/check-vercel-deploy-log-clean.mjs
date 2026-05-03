import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_LOG_PATH = 'test-results/vercel-deploy.log'

const WARNING_PATTERNS = [
  { code: 'typescriptDiagnostic', pattern: /\berror TS\d+:/i },
  { code: 'vercelWarning', pattern: /\b(?:warning|warn):\s/i },
  { code: 'functionPackagingWarning', pattern: /function(?:s)?\s+(?:exceeded|warning|failed|packag)/i },
  { code: 'nodeNextDiagnostic', pattern: /moduleResolution.*NodeNext|relative import paths need explicit file extensions/i },
]

const ADVISORY_PATTERNS = [
  { code: 'npmDeprecation', pattern: /\bnpm\s+warn\s+deprecated\b/i },
]

export function findVercelDeployLogViolations(logText) {
  const lines = String(logText).split(/\r?\n/)
  return lines.flatMap((line, index) =>
    WARNING_PATTERNS
      .filter(({ pattern }) => pattern.test(line))
      .map(({ code }) => ({
        code,
        lineNumber: index + 1,
        line: line.trim(),
      })),
  )
}

export function findVercelDeployLogAdvisories(logText) {
  const lines = String(logText).split(/\r?\n/)
  return lines.flatMap((line, index) =>
    ADVISORY_PATTERNS
      .filter(({ pattern }) => pattern.test(line))
      .map(({ code }) => ({
        code,
        lineNumber: index + 1,
        line: line.trim(),
      })),
  )
}

export function readVercelDeployLogFromInputs({
  argv = process.argv,
  env = process.env,
  defaultLogPath = DEFAULT_LOG_PATH,
} = {}) {
  const argPath = argv[2]
  if (env.VERCEL_DEPLOY_LOG) {
    return { source: 'VERCEL_DEPLOY_LOG', text: env.VERCEL_DEPLOY_LOG }
  }

  if (argPath) {
    const absolutePath = resolve(argPath)
    return { source: absolutePath, text: readFileSync(absolutePath, 'utf8') }
  }

  if (env.VERCEL_DEPLOY_LOG_PATH) {
    const absolutePath = resolve(env.VERCEL_DEPLOY_LOG_PATH)
    return { source: absolutePath, text: readFileSync(absolutePath, 'utf8') }
  }

  const defaultPath = resolve(defaultLogPath)
  if (existsSync(defaultPath)) {
    return { source: defaultPath, text: readFileSync(defaultPath, 'utf8') }
  }

  return null
}

function runCli() {
  const log = readVercelDeployLogFromInputs()
  const strict = process.env.VERCEL_ENV === 'production' || process.env.PRODUCTION_RELEASE_REQUIRED === 'true'

  if (!log) {
    if (strict) {
      console.error('No Vercel deploy log supplied. Set VERCEL_DEPLOY_LOG or pass a log file path.')
      process.exit(1)
    }

    console.log('No Vercel deploy log supplied; deploy-log scanner is configured and will enforce logs in production.')
    process.exit(0)
  }

  const violations = findVercelDeployLogViolations(log.text)
  const advisories = findVercelDeployLogAdvisories(log.text)
  const report = {
    checkedAt: new Date().toISOString(),
    source: log.source,
    passed: violations.length === 0,
    violations,
    advisories,
  }
  mkdirSync(resolve('tmp'), { recursive: true })
  writeFileSync(resolve('tmp/vercel-deploy-log-clean-report.json'), `${JSON.stringify(report, null, 2)}\n`)

  if (violations.length > 0) {
    console.error(`Vercel deploy log contains ${violations.length} warning/diagnostic line(s):`)
    for (const violation of violations.slice(0, 20)) {
      console.error(`${violation.lineNumber}: [${violation.code}] ${violation.line}`)
    }
    process.exit(1)
  }

  console.log(`Vercel deploy log clean: ${log.source}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
