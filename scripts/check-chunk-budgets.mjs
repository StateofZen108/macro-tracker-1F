import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const distRoot = resolve(process.cwd(), 'dist')
const distAssetsDir = resolve(distRoot, 'assets')
const RAW_LIMIT_BYTES = 500 * 1024
const FOOD_ACQUISITION_LIMIT_BYTES = 400 * 1024
const MAIN_GZIP_LIMIT_BYTES = 150 * 1024
const RAW_LIMIT_OVERRIDES = [
  {
    prefix: 'heic2any-',
    rawLimitBytes: 1400 * 1024,
  },
]

if (!existsSync(distAssetsDir)) {
  console.error('Expected dist/assets to exist. Run the production build before checking chunk budgets.')
  process.exit(1)
}

const assetFiles = readdirSync(distAssetsDir).filter((file) => file.endsWith('.js'))
const violations = []

for (const file of assetFiles) {
  const absolutePath = join(distAssetsDir, file)
  const rawBytes = statSync(absolutePath).size
  const rawLimitOverride = RAW_LIMIT_OVERRIDES.find((entry) => file.startsWith(entry.prefix))
  const rawLimitBytes = rawLimitOverride?.rawLimitBytes ?? RAW_LIMIT_BYTES

  if (rawBytes > rawLimitBytes) {
    violations.push(`${file} exceeds the raw chunk budget (${rawBytes} bytes > ${rawLimitBytes} bytes).`)
  }

  if (file.startsWith('food-acquisition-') && rawBytes > FOOD_ACQUISITION_LIMIT_BYTES) {
    violations.push(
      `${file} exceeds the food-acquisition chunk budget (${rawBytes} bytes > ${FOOD_ACQUISITION_LIMIT_BYTES} bytes).`,
    )
  }

  if (file.startsWith('index-')) {
    const gzipBytes = gzipSync(readFileSync(absolutePath)).length
    if (gzipBytes > MAIN_GZIP_LIMIT_BYTES) {
      violations.push(
        `${file} exceeds the main entry gzip budget (${gzipBytes} bytes > ${MAIN_GZIP_LIMIT_BYTES} bytes).`,
      )
    }
  }
}

if (!assetFiles.some((file) => file.startsWith('food-acquisition-'))) {
  violations.push('Missing food-acquisition chunk output.')
}

if (!assetFiles.some((file) => file.startsWith('index-'))) {
  violations.push('Missing main entry chunk output.')
}

const serviceWorkerPath = join(distRoot, 'sw.js')
if (existsSync(serviceWorkerPath)) {
  const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8')
  if (serviceWorkerSource.includes('heic2any-')) {
    violations.push('HEIC conversion chunk is present in the PWA app-shell precache.')
  }
} else {
  violations.push('Missing generated service worker output.')
}

if (violations.length) {
  console.error('Chunk budget check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Chunk budgets passed with HEIC excluded from app-shell precache.')
