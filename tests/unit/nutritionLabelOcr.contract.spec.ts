import { describe, it } from 'vitest'

describe('nutrition-label OCR parser contracts', () => {
  it.todo(
    'normalizes extracted label rows into trimmed review rows while preserving source order and dropping empty noise rows',
  )

  it.todo(
    'maps canonical macro aliases onto calories, protein, carbs, fat, and fiber without double-counting duplicate aliases',
  )

  it.todo(
    'preserves unmapped OCR rows for review instead of dropping them during normalization or canonical macro mapping',
  )
})
