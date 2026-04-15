import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const e2eDir = path.join(repoRoot, 'tests', 'e2e')
const previewDir = path.join(e2eDir, 'preview')
const previewSuffix = '.preview.spec.ts'

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

const allSpecs = collectSpecFiles(e2eDir)
const previewSpecs = collectSpecFiles(previewDir)

const misplacedPreviewSpecs = allSpecs.filter(
  (filePath) =>
    path.basename(filePath).endsWith(previewSuffix) &&
    !toRepoPath(filePath).startsWith('tests/e2e/preview/'),
)
if (misplacedPreviewSpecs.length > 0) {
  fail(
    `Preview specs must live under tests/e2e/preview/.\n${misplacedPreviewSpecs
      .map(toRepoPath)
      .join('\n')}`,
  )
}

const invalidPreviewDirSpecs = previewSpecs.filter(
  (filePath) => !path.basename(filePath).endsWith(previewSuffix),
)
if (invalidPreviewDirSpecs.length > 0) {
  fail(
    `All specs in tests/e2e/preview/ must end in ${previewSuffix}.\n${invalidPreviewDirSpecs
      .map(toRepoPath)
      .join('\n')}`,
  )
}

console.log('E2E lane guard passed.')
