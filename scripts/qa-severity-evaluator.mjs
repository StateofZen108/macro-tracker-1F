import path from 'node:path'
import { evaluateQaVerdict, loadJsonFile, writeJsonFile } from './qa-release/shared.mjs'

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      continue
    }
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      values[key] = true
      continue
    }
    values[key] = next
    index += 1
  }
  return values
}

const args = parseArgs(process.argv.slice(2))
const inputPath = typeof args.input === 'string' ? path.resolve(args.input) : null
const outputPath =
  typeof args.output === 'string'
    ? path.resolve(args.output)
    : path.resolve(process.cwd(), 'test-results', 'qa-release-gate', 'qa-run-artifact.json')

if (!inputPath) {
  console.error('Missing --input for qa severity evaluator.')
  process.exit(1)
}

const evaluationInput = loadJsonFile(inputPath, null)
if (!evaluationInput) {
  console.error(`Unable to read QA evaluation input from ${inputPath}.`)
  process.exit(1)
}

const artifact = evaluateQaVerdict(evaluationInput)
writeJsonFile(outputPath, artifact)

if (artifact.verdict === 'fail') {
  process.exit(1)
}
