import { runTenOutOfTenSuite, TEN_OUT_OF_TEN_REPORT_PATH } from './run-10-out-of-10-suite.mjs'

const report = await runTenOutOfTenSuite({ mode: 'production' })
const failed = report.rails.filter((rail) => rail.status === 'failed')
const pending = report.rails.filter((rail) => rail.status === 'pending_external')

if (failed.length || pending.length) {
  console.error('10/10 production suite failed:')
  for (const rail of [...failed, ...pending]) {
    console.error(`- ${rail.id}: ${rail.blocker ?? rail.status}`)
  }
  console.error(`Report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
  process.exit(1)
}

console.log('10/10 production suite passed.')
