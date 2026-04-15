import { spawnSync } from 'node:child_process'

if (process.env.ALLOW_COACH_BASELINE_UPDATE !== '1') {
  console.error('Set ALLOW_COACH_BASELINE_UPDATE=1 before updating the coach replay baseline.')
  process.exit(1)
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

const vitestInvocation = getNpmInvocation(['run', 'test:unit', '--', 'tests/unit/coaching.wave1.replay.spec.ts'])
const result = spawnSync(
  vitestInvocation.command,
  vitestInvocation.args,
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      COACH_BASELINE_UPDATE: '1',
    },
  },
)

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status ?? 1)
