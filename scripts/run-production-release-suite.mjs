import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function requiredBuildId(env) {
  const buildId = env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  if (!buildId) {
    throw new Error('Production release requires explicit VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.')
  }
  if (buildId.startsWith('local-release-')) {
    throw new Error('Production release cannot use a local fallback build ID.')
  }
  return buildId
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
    child.on('exit', (code) => resolve(typeof code === 'number' ? code : 1))
    child.on('error', () => resolve(1))
  })
}

const releaseEnv = {
  ...process.env,
  PRODUCTION_RELEASE_REQUIRED: 'true',
  RELEASE_DEVICE_QA_REQUIRED: 'true',
}

try {
  console.log(`Production release build id: ${requiredBuildId(releaseEnv)}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid production release environment.')
  process.exit(1)
}

for (const scriptName of [
  'test:release',
  'test:observability:smoke',
  'test:module-budgets',
  'test:production-readiness',
  'test:release:hygiene',
]) {
  const code = await runNpmScript(scriptName, releaseEnv)
  if (code !== 0) {
    process.exit(code)
  }
}
