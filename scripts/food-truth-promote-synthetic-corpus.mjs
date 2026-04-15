import { spawnSync } from 'node:child_process'
import {
  PRODUCTION_LIKE_ENV,
  corpusStatusPath,
  createSyntheticCorpusStatus,
  readJson,
  repoRoot,
  writeJson,
} from './food-truth-readiness-shared.mjs'

function fail(message) {
  console.error(`food-truth-promote-synthetic-corpus: ${message}`)
  process.exit(1)
}

function runChecked(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    fail(result.error.message)
  }
  if ((result.status ?? 1) !== 0) {
    const stderr = `${result.stderr ?? ''}`.trim()
    const stdout = `${result.stdout ?? ''}`.trim()
    fail(stderr || stdout || `${command} ${args.join(' ')} failed.`)
  }
}

function main() {
  const corpusStatus = readJson(corpusStatusPath)
  if (!['scaffold', 'synthetic_engineering'].includes(corpusStatus.mode)) {
    fail(`corpus-status.json mode must be "scaffold" or "synthetic_engineering", found "${corpusStatus.mode ?? ''}".`)
  }

  const previousStatus = corpusStatus

  writeJson(corpusStatusPath, createSyntheticCorpusStatus())

  try {
    runChecked(process.execPath, ['scripts/food-truth-benchmark.mjs'])
    runChecked(process.execPath, ['scripts/food-truth-record-engineering-acceptance.mjs'], {
      ...process.env,
      ...PRODUCTION_LIKE_ENV,
    })
  } catch (error) {
    writeJson(corpusStatusPath, previousStatus)
    throw error
  }

  console.log('FOOD_TRUTH_SYNTHETIC_ENGINEERING_READY')
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : `${error}`)
}
