import { runTenOutOfTenSuite, TEN_OUT_OF_TEN_REPORT_PATH } from './run-10-out-of-10-suite.mjs'

const report = await runTenOutOfTenSuite({ mode: 'preview' })
const failed = report.rails.filter((rail) => rail.status === 'failed')
const pending = report.rails.filter((rail) => rail.status === 'pending_external')

if (failed.length) {
  console.error('10/10 preview suite failed:')
  for (const rail of failed) {
    console.error(`- ${rail.id}: ${rail.blocker ?? 'failed'}`)
  }
  console.error(`Report written to ${TEN_OUT_OF_TEN_REPORT_PATH}.`)
  process.exit(1)
}

if (pending.length && process.env.TEN_OUT_OF_TEN_REQUIRE_ALL === 'true') {
  console.error('10/10 preview suite has pending external proof:')
  for (const rail of pending) {
    console.error(`- ${rail.id}: ${rail.blocker ?? 'pending external proof'}`)
  }
  process.exit(1)
}

console.log(`10/10 preview suite ${pending.length ? 'green with external pending rails' : 'passed'}.`)
