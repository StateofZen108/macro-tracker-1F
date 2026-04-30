import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findVercelDeployLogAdvisories,
  findVercelDeployLogViolations,
} from './check-vercel-deploy-log-clean.mjs'
import { runPreviewSmoke } from './check-vercel-preview-smoke.mjs'

const REPORT_PATH = resolve('tmp', 'vercel-preview-proof.json')
const DEFAULT_LOG_PATH = resolve('test-results', 'vercel-deploy.log')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const vercelCommand = process.platform === 'win32' ? 'vercel.cmd' : 'vercel'

function truthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function writeFileEnsuringDir(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function writeReport(report) {
  writeFileEnsuringDir(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
}

function runCommand(command, args, options = {}) {
  const windowsCmd = process.platform === 'win32' && command.endsWith('.cmd')
  const executable = windowsCmd ? 'cmd.exe' : command
  const executableArgs = windowsCmd ? ['/d', '/s', '/c', command, ...args] : args
  const result = spawnSync(executable, executableArgs, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

function runNpmScript(scriptName, env) {
  return runCommand(npmCommand, ['run', scriptName], { env })
}

function readGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function readGitStatus() {
  return execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function extractPreviewUrl(output) {
  const urls = String(output).match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/g) ?? []
  return urls.at(-1)?.replace(/[),.]+$/, '') ?? ''
}

function parseInspectJson(text) {
  const trimmed = String(text).trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    }
    throw new Error('Unable to parse Vercel inspect JSON.')
  }
}

export function readDeploymentCommitSha(inspectJson) {
  const meta = inspectJson?.meta ?? {}
  return (
    inspectJson?.gitSource?.sha ||
    inspectJson?.gitSource?.refSha ||
    meta.githubCommitSha ||
    meta.gitCommitSha ||
    meta.VERCEL_GIT_COMMIT_SHA ||
    ''
  )
}

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase()
}

export function resolveDeploymentCommitProof({
  deploymentCommitSha,
  gitSha,
  createdByProofScript,
}) {
  if (normalizeSha(deploymentCommitSha) === normalizeSha(gitSha)) {
    return {
      passed: true,
      evidence: deploymentCommitSha,
      mode: 'vercel_metadata',
    }
  }

  if (!deploymentCommitSha && createdByProofScript) {
    return {
      passed: true,
      evidence: gitSha,
      mode: 'local_clean_tree_deploy',
    }
  }

  return {
    passed: false,
    evidence: deploymentCommitSha || '<missing>',
    mode: 'missing_or_mismatched_metadata',
  }
}

export async function runVercelPreviewProof({ env = process.env } = {}) {
  const strict = env.VERCEL_PREVIEW_PROOF_STRICT === undefined ? true : truthy(env.VERCEL_PREVIEW_PROOF_STRICT)
  const logPath = resolve(env.VERCEL_DEPLOY_LOG_PATH || DEFAULT_LOG_PATH)
  const gitSha = readGitSha()
  const report = {
    checkedAt: new Date().toISOString(),
    gitSha,
    previewUrl: '',
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? '',
    status: 'failed',
    strict,
    rails: [],
    generatedFiles: [],
  }

  const dirtyStatus = readGitStatus()
  if (dirtyStatus) {
    report.rails.push({
      id: 'clean_tree',
      status: 'failed',
      reason: 'Working tree must be clean before preview proof.',
      details: dirtyStatus.split(/\r?\n/),
    })
    writeReport(report)
    return report
  }
  report.rails.push({ id: 'clean_tree', status: 'passed' })

  let createdByProofScript = false
  const typecheck = runNpmScript('test:server:function-typecheck', env)
  report.rails.push({
    id: 'server_typecheck',
    status: typecheck.status === 0 ? 'passed' : 'failed',
    command: typecheck.command,
  })
  if (typecheck.status !== 0) {
    report.typecheckOutput = typecheck.output
    writeReport(report)
    return report
  }

  let previewUrl = env.VERCEL_PREVIEW_URL?.trim() || ''
  if (!previewUrl) {
    createdByProofScript = true
    const deploy = runCommand(
      vercelCommand,
      [
        'deploy',
        '--yes',
        '--meta',
        `githubCommitSha=${gitSha}`,
        '--meta',
        `gitCommitSha=${gitSha}`,
        '--meta',
        `VERCEL_GIT_COMMIT_SHA=${gitSha}`,
      ],
      { env },
    )
    report.rails.push({
      id: 'vercel_deploy',
      status: deploy.status === 0 ? 'passed' : 'failed',
      command: deploy.command,
    })
    if (deploy.status !== 0) {
      report.deployOutput = deploy.output
      writeReport(report)
      return report
    }
    previewUrl = extractPreviewUrl(deploy.output)
    report.deployOutput = deploy.output
  } else {
    report.rails.push({ id: 'vercel_deploy', status: 'skipped', reason: 'Using VERCEL_PREVIEW_URL.' })
  }

  report.previewUrl = previewUrl
  if (!previewUrl) {
    report.rails.push({
      id: 'preview_url',
      status: 'failed',
      reason: 'No Vercel preview URL was supplied or found in deploy output.',
    })
    writeReport(report)
    return report
  }
  report.rails.push({ id: 'preview_url', status: 'passed', evidence: previewUrl })

  const inspect = runCommand(vercelCommand, ['inspect', previewUrl, '--format=json'], { env })
  report.rails.push({
    id: 'vercel_inspect',
    status: inspect.status === 0 ? 'passed' : 'failed',
    command: inspect.command,
  })
  if (inspect.status !== 0) {
    report.inspectOutput = inspect.output
    writeReport(report)
    return report
  }

  const inspectJson = parseInspectJson(inspect.stdout)
  report.deploymentId = inspectJson?.uid || inspectJson?.id || report.deploymentId
  report.readyState = inspectJson?.readyState || inspectJson?.state || ''
  const deploymentCommitSha = readDeploymentCommitSha(inspectJson)
  report.deploymentCommitSha = deploymentCommitSha
  const commitProof = resolveDeploymentCommitProof({
    deploymentCommitSha,
    gitSha,
    createdByProofScript,
  })
  report.deploymentCommitProof = commitProof
  report.rails.push({
    id: 'preview_commit_current',
    status: commitProof.passed ? 'passed' : 'failed',
    evidence: commitProof.evidence,
    mode: commitProof.mode,
  })
  if (!commitProof.passed) {
    writeReport(report)
    return report
  }

  const logs = runCommand(vercelCommand, ['inspect', previewUrl, '--logs'], { env })
  const logText = logs.output || inspect.output
  writeFileEnsuringDir(logPath, logText)
  report.generatedFiles.push(logPath)
  report.rails.push({
    id: 'vercel_logs_captured',
    status: logs.status === 0 || existsSync(logPath) ? 'passed' : 'failed',
    command: logs.command,
    evidence: logPath,
  })

  const deployLogText = readFileSync(logPath, 'utf8')
  const violations = findVercelDeployLogViolations(deployLogText)
  const advisories = findVercelDeployLogAdvisories(deployLogText)
  report.deployLogViolations = violations
  report.deployLogAdvisories = advisories
  report.rails.push({
    id: 'deploy_log_clean',
    status: violations.length === 0 ? 'passed' : 'failed',
    evidence: logPath,
  })
  if (violations.length) {
    writeReport(report)
    return report
  }

  const smoke = await runPreviewSmoke({
    env: {
      ...env,
      VERCEL_PREVIEW_URL: previewUrl,
    },
  })
  report.smoke = smoke
  report.rails.push({
    id: 'preview_smoke',
    status: smoke.status === 'passed' ? 'passed' : 'failed',
    evidence: 'tmp/vercel-preview-smoke-report.json',
    reason: smoke.reason,
  })
  if (smoke.status !== 'passed') {
    writeReport(report)
    return report
  }

  report.status = 'preview_verified'
  writeReport(report)
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVercelPreviewProof()
    .then((report) => {
      const failedRails = report.rails.filter((rail) => rail.status === 'failed')
      if (report.status === 'preview_verified') {
        console.log(`Vercel preview proof verified: ${report.previewUrl}`)
        return
      }

      const message = failedRails.length
        ? failedRails.map((rail) => `- ${rail.id}: ${rail.reason ?? rail.evidence ?? 'failed'}`).join('\n')
        : '- preview proof did not reach verified state.'
      console.error(`Vercel preview proof failed:\n${message}`)
      process.exit(report.strict ? 1 : 0)
    })
    .catch((error) => {
      const report = {
        checkedAt: new Date().toISOString(),
        status: 'failed',
        strict: process.env.VERCEL_PREVIEW_PROOF_STRICT !== 'false',
        reason: error instanceof Error ? error.message : String(error),
      }
      writeReport(report)
      console.error(`Vercel preview proof failed: ${report.reason}`)
      process.exit(report.strict ? 1 : 0)
    })
}
