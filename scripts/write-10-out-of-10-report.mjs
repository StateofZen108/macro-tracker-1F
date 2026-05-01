import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  TEN_OUT_OF_TEN_REPORT_PATH,
  TEN_OUT_OF_TEN_TARGET,
  derivePendingExternalFromArtifact,
  validateTenReportShape,
} from './run-10-out-of-10-suite.mjs'

function readExistingReport() {
  if (!existsSync(TEN_OUT_OF_TEN_REPORT_PATH)) {
    return null
  }
  return JSON.parse(readFileSync(TEN_OUT_OF_TEN_REPORT_PATH, 'utf8'))
}

function refreshPendingRails(report) {
  const pendingArtifacts = {
    production_operable: 'tmp/production-rails-accessible-report.json',
    physical_device_verified: 'tmp/native-device-proof-report.json',
  }

  return {
    ...report,
    checkedAt: new Date().toISOString(),
    target: report.target || TEN_OUT_OF_TEN_TARGET,
    rails: report.rails.map((rail) => {
      const pendingArtifact = pendingArtifacts[rail.id]
      if (!pendingArtifact) {
        return rail
      }
      const pending = derivePendingExternalFromArtifact(pendingArtifact)
      if (!pending) {
        return rail.status === 'pending_external' ? { ...rail, status: 'passed', blocker: undefined } : rail
      }
      return { ...rail, status: 'pending_external', blocker: pending }
    }),
  }
}

const existing = readExistingReport()
if (!existing) {
  console.error(`No existing 10/10 report found at ${TEN_OUT_OF_TEN_REPORT_PATH}. Run npm run test:10 first.`)
  process.exit(1)
}

const report = refreshPendingRails(existing)
const errors = validateTenReportShape(report)
if (errors.length) {
  console.error('10/10 report validation failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

mkdirSync(dirname(resolve(TEN_OUT_OF_TEN_REPORT_PATH)), { recursive: true })
writeFileSync(TEN_OUT_OF_TEN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
console.log(`10/10 report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
