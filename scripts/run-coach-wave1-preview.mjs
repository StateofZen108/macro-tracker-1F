import { spawn, spawnSync } from 'node:child_process'
import { createPreviewEnv } from './preview-env.mjs'

const port = process.argv[2] ?? process.env.COACH_WAVE1_PREVIEW_PORT ?? '4174'
const coachPreviewEnv = createPreviewEnv('coach-preview')

function getNpmInvocation(args) {
  return process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm.cmd', ...args],
      }
    : {
        command: 'npm',
        args,
      }
}

const buildInvocation = getNpmInvocation(['run', 'build'])
const buildResult = spawnSync(buildInvocation.command, buildInvocation.args, {
  stdio: 'inherit',
  env: coachPreviewEnv,
})

if (buildResult.error) {
  console.error(buildResult.error.message)
  process.exit(1)
}

if ((buildResult.status ?? 1) !== 0) {
  process.exit(buildResult.status ?? 1)
}

const previewInvocation = getNpmInvocation(['run', 'preview', '--', '--port', port])
const previewProcess = spawn(previewInvocation.command, previewInvocation.args, {
  stdio: 'inherit',
  env: coachPreviewEnv,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    previewProcess.kill(signal)
  })
}

previewProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
