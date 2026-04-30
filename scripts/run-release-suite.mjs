import { execFileSync, spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function resolveFallbackBuildId() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (sha) {
      return `local-release-${sha}`
    }
  } catch {
    // Fall back to a timestamp only when git metadata is unavailable.
  }

  return `local-release-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

function buildReleaseEnv() {
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key && !key.startsWith('=') && typeof value === 'string',
    ),
  )

  if (
    baseEnv.VITE_APP_BUILD_ID ||
    baseEnv.VERCEL_GIT_COMMIT_SHA ||
    baseEnv.GIT_COMMIT_SHA
  ) {
    return baseEnv
  }

  return {
    ...baseEnv,
    VITE_APP_BUILD_ID: resolveFallbackBuildId(),
  }
}

function runNpmScript(scriptName, env) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', npmCommand, 'run', scriptName]
        : ['run', scriptName]

    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    })

    child.on('exit', (code, signal) => {
      resolve({ code: typeof code === 'number' ? code : 1, signal })
    })

    child.on('error', (error) => {
      console.error(error.message)
      resolve({ code: 1, signal: 'spawn_error' })
    })
  })
}

function isFeatureEnabled(value) {
  if (typeof value !== 'string') {
    return true
  }

  const normalized = value.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off'
}

function isRequired(value) {
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'on'
}

const releaseEnv = buildReleaseEnv()
const buildId =
  releaseEnv.VITE_APP_BUILD_ID ?? releaseEnv.VERCEL_GIT_COMMIT_SHA ?? releaseEnv.GIT_COMMIT_SHA
console.log(`Release suite build id: ${buildId}`)

const scripts = [
  'test:security:audit',
  'test:all',
  'test:module-budgets',
  ...(isFeatureEnabled(releaseEnv.VITE_FF_MACRO_FACTOR_CORPUS_GATE_V1)
    ? ['test:history-import:corpus']
    : []),
  ...(isFeatureEnabled(releaseEnv.VITE_FF_STANDALONE_CUT_NINE_V1)
    ? ['test:standalone-cut-9']
    : []),
  ...(isFeatureEnabled(releaseEnv.VITE_FF_MACRO_FACTOR_SURPASS_V1)
    ? ['test:macrofactor-surpass']
    : []),
  'test:e2e:lane-guard',
  'test:e2e:personal-library-preview',
  'test:e2e:coach-preview',
  ...(isRequired(releaseEnv.RELEASE_DEVICE_QA_REQUIRED) || releaseEnv.VERCEL_ENV === 'production'
    ? ['test:device-qa:evidence']
    : []),
  'test:release:hygiene',
]

for (const scriptName of scripts) {
  const result = await runNpmScript(scriptName, releaseEnv)
  if (result.code !== 0) {
    process.exit(result.code)
  }
}
