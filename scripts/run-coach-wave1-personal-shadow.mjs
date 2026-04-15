import { spawnSync } from 'node:child_process'

const backupPath = process.argv[2] ?? process.env.COACH_PERSONAL_BACKUP_PATH

if (!backupPath) {
  console.error(
    'Provide a backup export path as COACH_PERSONAL_BACKUP_PATH or as the first CLI argument.',
  )
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

const npmInvocation = getNpmInvocation([
  'run',
  'test:unit',
  '--',
  'tests/unit/coaching.wave1.personal-shadow.spec.ts',
  '--',
  `--backup=${backupPath}`,
])
const result = spawnSync(
  npmInvocation.command,
  npmInvocation.args,
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      COACH_PERSONAL_BACKUP_PATH: backupPath,
    },
  },
)

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status ?? 1)
