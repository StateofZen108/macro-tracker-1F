import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RESULT_PATH = (buildId) => resolve('test-results', 'device-qa', buildId, 'android-device-qa-result.json')
const INSTRUCTIONS_PATH = (buildId) => resolve('test-results', 'device-qa', buildId, 'android-operator-instructions.json')

export function commandExists(command) {
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return { serial, state }
    })
    .filter((device) => device.serial)
}

export function resolveAndroidDeviceQaPlan(env = process.env, commandExistsImpl = commandExists, execImpl = execFileSync) {
  const buildId = env.VITE_APP_BUILD_ID || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA
  const errors = []
  if (!buildId) {
    errors.push('VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA is required.')
  }
  if (!env.PRODUCTION_BASE_URL) {
    errors.push('PRODUCTION_BASE_URL is required for Android device QA.')
  }
  if (!commandExistsImpl('adb')) {
    errors.push('ADB is required for auto_android device QA.')
    return { ok: false, buildId, devices: [], errors }
  }

  let devices = []
  try {
    devices = parseAdbDevices(execImpl('adb', ['devices'], { encoding: 'utf8' }))
  } catch (error) {
    errors.push(`Unable to list ADB devices: ${error instanceof Error ? error.message : String(error)}`)
  }

  const readyDevices = devices.filter((device) => device.state === 'device')
  const requestedSerial = env.ANDROID_DEVICE_SERIAL
  const selectedDevice = requestedSerial
    ? readyDevices.find((device) => device.serial === requestedSerial)
    : readyDevices[0]

  if (!selectedDevice) {
    errors.push(requestedSerial
      ? `No connected Android device matches ANDROID_DEVICE_SERIAL=${requestedSerial}.`
      : 'No connected physical Android device is available through ADB.')
  }

  return {
    ok: errors.length === 0,
    buildId,
    devices,
    selectedDevice,
    resultPath: buildId ? RESULT_PATH(buildId) : '',
    instructionsPath: buildId ? INSTRUCTIONS_PATH(buildId) : '',
    errors,
  }
}

function writeOperatorInstructions(path, plan, env) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({
    buildId: plan.buildId,
    productionBaseUrl: env.PRODUCTION_BASE_URL,
    selectedDevice: plan.selectedDevice,
    checkedAt: new Date().toISOString(),
    requiredChecks: [
      'camera_permission_denied',
      'barcode_permission_granted',
      'barcode_manual_fallback',
      'ocr_capture_save',
      'pwa_install_reopen',
      'offline_reopen_log',
      'discard_dialog_hit_test',
    ],
    evidenceContract: 'Provide DEVICE_QA_OPERATOR_EVIDENCE_JSON pointing to a JSON file with the required checks, evidence paths, and automationMode values.',
  }, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const plan = resolveAndroidDeviceQaPlan()
  if (!plan.ok) {
    for (const error of plan.errors) {
      console.error(error)
    }
    process.exit(1)
  }

  const sourcePath = process.env.DEVICE_QA_OPERATOR_EVIDENCE_JSON || process.env.DEVICE_QA_RESULT_SOURCE
  writeOperatorInstructions(plan.instructionsPath, plan, process.env)

  if (!sourcePath) {
    console.error(`Android device detected (${plan.selectedDevice.serial}), but hardware-only QA evidence has not been supplied.`)
    console.error(`Operator instructions written to ${plan.instructionsPath}.`)
    console.error('Set DEVICE_QA_OPERATOR_EVIDENCE_JSON to the completed physical-device evidence JSON and rerun.')
    process.exit(1)
  }
  if (!existsSync(sourcePath)) {
    console.error(`DEVICE_QA_OPERATOR_EVIDENCE_JSON does not exist: ${sourcePath}`)
    process.exit(1)
  }

  mkdirSync(dirname(plan.resultPath), { recursive: true })
  copyFileSync(sourcePath, plan.resultPath)
  console.log(`Android device QA evidence captured: ${plan.resultPath}`)
}
