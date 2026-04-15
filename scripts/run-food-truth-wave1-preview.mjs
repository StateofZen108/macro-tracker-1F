import { spawn, spawnSync } from 'node:child_process'

const port = process.argv[2] ?? process.env.FOOD_TRUTH_WAVE1_PREVIEW_PORT ?? '4176'
const previewEnv = {
  ...process.env,
  MODE: 'production',
  VITE_FF_IMPORT_TRUST_V1: 'true',
  VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
  VITE_FF_LABEL_OCR_TRUST_V1: 'true',
  VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'false',
}

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
  env: previewEnv,
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
  env: previewEnv,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    previewProcess.kill(signal)
  })
}

previewProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
