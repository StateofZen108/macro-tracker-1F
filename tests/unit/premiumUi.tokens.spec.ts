import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('premium UI tokens', () => {
  const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

  it('defines shared macro and premium surface tokens', () => {
    expect(css).toContain('--macro-calories:')
    expect(css).toContain('--macro-protein:')
    expect(css).toContain('--macro-fat:')
    expect(css).toContain('--macro-carbs:')
    expect(css).toContain('.premium-command-surface')
    expect(css).toContain('.premium-action-surface')
    expect(css).toContain('.premium-data-surface')
  })

  it('exposes class hooks for consistent macro color rendering', () => {
    expect(css).toContain('.macro-color-protein')
    expect(css).toContain('.macro-color-fat')
    expect(css).toContain('.macro-color-carbs')
    expect(css).toContain('.macro-bg-protein')
    expect(css).toContain('.macro-bg-fat')
    expect(css).toContain('.macro-bg-carbs')
  })
})
