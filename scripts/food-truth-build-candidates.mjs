import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function normalizeBarcode(value) {
  return `${value ?? ''}`.replace(/\D/g, '')
}

function normalizeText(value) {
  return `${value ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function formatIsoDate(value) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return new Date(parsed).toISOString()
}

function parseArgs(argv) {
  const backupIndex = argv.indexOf('--backup')
  if (backupIndex === -1 || !argv[backupIndex + 1]) {
    fail('food-truth-build-candidates: use --backup <absolute-path-to-backup.json>.')
  }
  return {
    backupPath: path.resolve(argv[backupIndex + 1]),
  }
}

function makeSlug(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'food'
}

function main() {
  const { backupPath } = parseArgs(process.argv.slice(2))
  if (!path.isAbsolute(backupPath)) {
    fail('food-truth-build-candidates: --backup must be an absolute path.')
  }
  if (!fs.existsSync(backupPath)) {
    fail(`food-truth-build-candidates: backup file not found at ${backupPath}.`)
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  const foods = Array.isArray(backup.foods) ? backup.foods : []
  const logsByDate = typeof backup.logsByDate === 'object' && backup.logsByDate !== null ? backup.logsByDate : {}
  const backupExportedAt = formatIsoDate(backup.exportedAt)
  if (!backupExportedAt) {
    fail('food-truth-build-candidates: backup.exportedAt is missing or invalid.')
  }

  const sourceWindowEnd = backupExportedAt
  const sourceWindowStart = new Date(Date.parse(backupExportedAt) - 90 * 24 * 60 * 60 * 1000).toISOString()
  const foodMap = new Map(foods.map((food) => [food.id, food]))
  const allLogRows = Object.values(logsByDate).flatMap((entries) => (Array.isArray(entries) ? entries : []))
  const rankedGroups = new Map()
  let eligibleBarcodeRows = 0

  for (const entry of allLogRows) {
    if (!entry || entry.deletedAt) {
      continue
    }
    const entryDate = formatIsoDate(entry.date)
    if (!entryDate || entryDate < sourceWindowStart || entryDate > sourceWindowEnd) {
      continue
    }

    const resolvedFood = entry.foodId && foodMap.has(entry.foodId) ? foodMap.get(entry.foodId) : entry.snapshot
    if (!resolvedFood) {
      continue
    }

    const barcode = normalizeBarcode(resolvedFood.barcode)
    const name = `${resolvedFood.name ?? ''}`.trim()
    if (barcode.length < 8 || !name || resolvedFood.source === 'recipe') {
      continue
    }

    eligibleBarcodeRows += 1
    const key = barcode
    const current = rankedGroups.get(key) ?? {
      barcode,
      name,
      brand: resolvedFood.brand?.trim() || undefined,
      foodId: entry.foodId && foodMap.has(entry.foodId) ? entry.foodId : undefined,
      logCount: 0,
      lastLoggedAt: sourceWindowStart,
      resolvedUsageCount: resolvedFood.usageCount ?? 0,
      sourceKind: entry.foodId && foodMap.has(entry.foodId) ? 'food' : 'snapshot',
      hasLabelImageCandidate: Boolean(resolvedFood.labelNutrition),
      requiresHardCaseTag: false,
      notes: undefined,
    }

    current.logCount += 1
    current.lastLoggedAt =
      [entry.updatedAt, entry.createdAt, entry.date]
        .map((value) => formatIsoDate(value))
        .find(Boolean) ?? current.lastLoggedAt
    current.resolvedUsageCount = Math.max(current.resolvedUsageCount, resolvedFood.usageCount ?? 0)
    current.hasLabelImageCandidate = current.hasLabelImageCandidate || Boolean(resolvedFood.labelNutrition)
    rankedGroups.set(key, current)
  }

  const sortedCandidates = [...rankedGroups.values()].sort((left, right) => {
    const logDelta = right.logCount - left.logCount
    if (logDelta !== 0) {
      return logDelta
    }
    const lastLoggedDelta = Date.parse(right.lastLoggedAt) - Date.parse(left.lastLoggedAt)
    if (lastLoggedDelta !== 0) {
      return lastLoggedDelta
    }
    const usageDelta = right.resolvedUsageCount - left.resolvedUsageCount
    if (usageDelta !== 0) {
      return usageDelta
    }
    return `${normalizeText(left.brand)} ${normalizeText(left.name)}`.localeCompare(
      `${normalizeText(right.brand)} ${normalizeText(right.name)}`,
    )
  })

  const barcodeCandidates = sortedCandidates.map((candidate, index) => {
    const rank = index + 1
    const suggestedFixtureId = `barcode-${String(rank).padStart(3, '0')}-${makeSlug(`${candidate.brand ?? ''}-${candidate.name}`)}`
    return {
      rank,
      barcode: candidate.barcode,
      name: candidate.name,
      brand: candidate.brand,
      foodId: candidate.foodId,
      logCount: candidate.logCount,
      lastLoggedAt: candidate.lastLoggedAt,
      resolvedUsageCount: candidate.resolvedUsageCount,
      sourceKind: candidate.sourceKind,
      hasLabelImageCandidate: candidate.hasLabelImageCandidate,
      suggestedFixtureId,
      notes: candidate.notes,
    }
  })

  const ocrEligibleCandidates = barcodeCandidates
    .filter((candidate) => candidate.hasLabelImageCandidate)
    .map((candidate) => ({
      ...candidate,
      suggestedImageFile: candidate.suggestedFixtureId.replace(/^barcode/, 'ocr') + '.png',
      requiresHardCaseTag: false,
    }))

  const output = {
    generatedAt: new Date().toISOString(),
    backupExportedAt,
    sourceWindowStart,
    sourceWindowEnd,
    summary: {
      totalLogRows: allLogRows.length,
      eligibleBarcodeRows,
      uniqueBarcodeCount: barcodeCandidates.length,
      selectedBarcodeTarget: 30,
      selectedOcrTarget: 15,
    },
    barcodeCandidates,
    ocrEligibleCandidates,
  }

  const outputDir = path.join(process.cwd(), 'tmp')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'food-truth-candidates.json')
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`food-truth-build-candidates: wrote ${output.barcodeCandidates.length} barcode candidates to ${outputPath}`)
}

main()
