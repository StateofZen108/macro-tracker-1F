export function parseCsv(rawText: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let insideQuotes = false

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index]
    const nextChar = rawText[index + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"'
        index += 1
        continue
      }

      insideQuotes = !insideQuotes
      continue
    }

    if (!insideQuotes && char === ',') {
      currentRow.push(currentField)
      currentField = ''
      continue
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }

      currentRow.push(currentField)
      rows.push(currentRow)
      currentRow = []
      currentField = ''
      continue
    }

    currentField += char
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}
