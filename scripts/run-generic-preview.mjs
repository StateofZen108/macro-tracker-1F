import { spawn, spawnSync } from 'node:child_process'

const port = process.argv[2] ?? process.env.GENERIC_PREVIEW_PORT ?? '4176'
const previewEnv = {
  ...process.env,
  MODE: 'production',
  VITE_APP_BUILD_ID:
    process.env.VITE_APP_BUILD_ID ?? `qa-generic-preview-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  VITE_FF_FOOD_CATALOG_SEARCH: 'true',
  VITE_FF_SAVED_MEALS: 'true',
  VITE_FF_FAVORITE_FOODS: 'true',
  VITE_FF_IMPORT_TRUST_V1: 'true',
  VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
  VITE_FF_LABEL_OCR_TRUST_V1: 'true',
  VITE_FF_NUTRITION_OVERVIEW_V1: 'true',
  VITE_FF_COACH_ENGINE_V3: 'true',
  VITE_FF_NUTRITION_OVERVIEW_V2: 'true',
  VITE_FF_FOOD_TRUTH_V2: 'true',
  VITE_FF_GARMIN_CONNECT_V1: 'true',
  VITE_FF_GARMIN_INTELLIGENCE_V2: 'true',
  VITE_FF_BODY_METRICS_V1: 'true',
  VITE_FF_PROGRESS_PHOTOS_V1: 'true',
  VITE_FF_WORKOUTS_V1: 'true',
  VITE_FF_DASHBOARD_V1: 'true',
  VITE_FF_CUT_MODE_V1: 'true',
  VITE_FF_LOGGING_SHORTCUTS_V1: 'true',
  VITE_FF_WORKOUTS_ANALYTICS_V2: 'true',
  VITE_FF_BODY_PROGRESS_COMPARE_V1: 'true',
  VITE_FF_DASHBOARD_INSIGHTS_V2: 'true',
  VITE_FF_WORKOUT_RECORDS_V1: 'true',
  VITE_FF_BODY_METRIC_VISIBILITY_V1: 'true',
  VITE_FF_COMMAND_HOME_V1: 'true',
  VITE_FF_REPEAT_LOGGING_V2: 'true',
  VITE_FF_TRAINING_GUIDANCE_V2: 'true',
  VITE_FF_PROGRESS_STORY_V1: 'true',
  VITE_FF_QUIET_SETTINGS_V1: 'true',
  VITE_FF_CAPTURE_CONVENIENCE_V1: 'true',
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
