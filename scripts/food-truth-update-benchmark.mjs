import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const fixturesDir = process.env.FOOD_TRUTH_FIXTURES_DIR
  ? path.resolve(process.env.FOOD_TRUTH_FIXTURES_DIR)
  : path.join(repoRoot, 'tests', 'fixtures', 'food-truth')
const manifestPath = path.join(fixturesDir, 'manifest.json')
const barcodeFixturePath = path.join(fixturesDir, 'barcode.real-world.json')
const ocrFixturePath = path.join(fixturesDir, 'ocr.real-world.json')
const seedPath = path.join(fixturesDir, 'local-state-seeds.json')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sortById(left, right) {
  return `${left.kind ?? ''}:${left.id ?? ''}`.localeCompare(`${right.kind ?? ''}:${right.id ?? ''}`)
}

function normalizeFile(filePath, sorter) {
  const payload = readJsonIfPresent(filePath)
  if (payload === null) {
    return null
  }
  if (!Array.isArray(payload)) {
    fail(`food-truth-update-benchmark: ${path.basename(filePath)} must be an array.`)
  }
  const normalized = [...payload].sort(sorter)
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`)
  return normalized.length
}

if (process.env.ALLOW_FOOD_TRUTH_BENCHMARK_UPDATE !== '1') {
  fail('food-truth-update-benchmark: set ALLOW_FOOD_TRUTH_BENCHMARK_UPDATE=1 to update benchmark metadata.')
}

if (!fs.existsSync(manifestPath)) {
  console.log('food-truth-update-benchmark: no manifest found yet; benchmark corpus is still in bootstrap mode.')
  process.exit(0)
}

const manifestCount = normalizeFile(manifestPath, sortById) ?? 0
const barcodeCount = normalizeFile(barcodeFixturePath, (left, right) => `${left.id ?? ''}`.localeCompare(`${right.id ?? ''}`)) ?? 0
const ocrCount = normalizeFile(ocrFixturePath, (left, right) => `${left.id ?? ''}`.localeCompare(`${right.id ?? ''}`)) ?? 0
const seedCount = normalizeFile(seedPath, (left, right) => `${left.id ?? ''}`.localeCompare(`${right.id ?? ''}`)) ?? 0

console.log(
  `food-truth-update-benchmark: normalized ${manifestCount} manifest entries, ${barcodeCount} barcode fixtures, ${ocrCount} OCR fixtures, and ${seedCount} local seeds.`,
)
