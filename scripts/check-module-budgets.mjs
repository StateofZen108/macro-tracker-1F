import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const MODULE_LINE_BUDGETS = [
  { path: 'src/app/AppComposition.tsx', maxLines: 800 },
  { path: 'src/screens/settings/SettingsScreenRoot.tsx', maxLines: 700 },
  { path: 'src/utils/storage/internal/index.ts', maxLines: 500 },
]

export function countLines(text) {
  return text.split(/\r?\n/).filter((line, index, lines) => index < lines.length - 1 || line.length > 0).length
}

export function findModuleBudgetViolations(readText = (path) => readFileSync(path, 'utf8')) {
  const violations = []
  for (const budget of MODULE_LINE_BUDGETS) {
    const lines = countLines(readText(budget.path))
    if (lines > budget.maxLines) {
      violations.push(`${budget.path} has ${lines} lines; budget is ${budget.maxLines}.`)
    }
  }
  return violations
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = findModuleBudgetViolations()
  if (violations.length) {
    console.error('Module budget check failed:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Module budgets verified.')
}
