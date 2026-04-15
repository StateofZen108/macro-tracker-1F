import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const e2eDir = path.join(repoRoot, 'tests', 'e2e')
const previewDir = path.join(e2eDir, 'preview')
const previewSuffix = '.preview.spec.ts'
const previewConfigExpectations = [
  {
    configFile: 'playwright.coach-wave1.config.ts',
    expectedFile: 'weight.coach-wave1.preview.spec.ts',
    label: 'Coach preview',
  },
  {
    configFile: 'playwright.personal-library.config.ts',
    expectedFile: 'personal-library.preview.spec.ts',
    label: 'Personal-library preview',
  },
  {
    configFile: 'playwright.psmf-phase.config.ts',
    expectedFile: 'psmf-phase.preview.spec.ts',
    label: 'PSMF phase preview',
  },
  {
    configFile: 'playwright.recovery-layer.config.ts',
    expectedFile: 'recovery-layer.preview.spec.ts',
    label: 'Recovery-layer preview',
  },
  {
    configFile: 'playwright.garmin-connect.config.ts',
    expectedFile: 'garmin-connect.preview.spec.ts',
    label: 'Garmin preview',
  },
  {
    configFile: 'playwright.food-truth-wave1.config.ts',
    expectedFile: 'food-truth-wave1.preview.spec.ts',
    label: 'Food Truth preview',
  },
  {
    configFile: 'playwright.psmf-garmin.config.ts',
    expectedFile: 'psmf-garmin.preview.spec.ts',
    label: 'PSMF-Garmin preview',
  },
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function collectSpecFiles(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSpecFiles(fullPath)
    }

    return entry.name.endsWith('.spec.ts') ? [fullPath] : []
  })
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/')
}

function getPlaywrightCliPath() {
  return path.join(repoRoot, 'node_modules', 'playwright', 'cli.js')
}

function extractListedFiles(output) {
  const matches = [...output.matchAll(/›\s+(.+?\.spec\.ts):\d+:\d+\s+›/g)].map((match) =>
    path.basename(match[1].trim()),
  )
  return [...new Set(matches)]
}

function runPlaywrightList(configFile) {
  const result = spawnSync(
    process.execPath,
    [getPlaywrightCliPath(), 'test', '--config', configFile, '--list'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  )

  if (result.error) {
    fail(`Lane guard could not spawn Playwright for ${configFile}: ${result.error.message}`)
  }

  if (result.status !== 0) {
    fail(
      `Lane guard failed to list tests for ${configFile}.\n${result.stderr || result.stdout || 'No output.'}`,
    )
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  const listedFiles = extractListedFiles(output)

  if (!output.includes('Listing tests:') || listedFiles.length === 0) {
    fail(`Lane guard could not parse Playwright --list output for ${configFile}.`)
  }

  return listedFiles
}

const allSpecFiles = collectSpecFiles(e2eDir)
const previewSpecFiles = collectSpecFiles(previewDir)
const previewNamedFiles = allSpecFiles.filter((file) => path.basename(file).endsWith(previewSuffix))

const misplacedPreviewFiles = previewNamedFiles.filter(
  (file) => !toRepoPath(file).startsWith('tests/e2e/preview/'),
)
if (misplacedPreviewFiles.length > 0) {
  fail(
    `Preview specs must live under tests/e2e/preview/. Misplaced files:\n${misplacedPreviewFiles
      .map(toRepoPath)
      .join('\n')}`,
  )
}

const nonPreviewFilesInPreviewDir = previewSpecFiles.filter(
  (file) => !path.basename(file).endsWith(previewSuffix),
)
if (nonPreviewFilesInPreviewDir.length > 0) {
  fail(
    `All specs in tests/e2e/preview/ must end in ${previewSuffix}. Offending files:\n${nonPreviewFilesInPreviewDir
      .map(toRepoPath)
      .join('\n')}`,
  )
}

const genericListedFiles = runPlaywrightList('playwright.config.ts')
if (genericListedFiles.some((file) => file.endsWith(previewSuffix))) {
  fail(`Generic Playwright config collected preview specs: ${genericListedFiles.join(', ')}`)
}

for (const { configFile, expectedFile, label } of previewConfigExpectations) {
  const listedFiles = runPlaywrightList(configFile)
  if (listedFiles.length !== 1 || listedFiles[0] !== expectedFile) {
    fail(
      `${label} config must collect only ${expectedFile}. Collected: ${listedFiles.join(', ')}`,
    )
  }
}

console.log('E2E lane guard passed.')
