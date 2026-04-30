import { describe, expect, it } from 'vitest'
import { buildDraftAiMealCapture, classifyAiMealCaptureResult } from '../../src/domain/aiMealCapture'

describe('AI meal capture', () => {
  it('keeps AI photo entries review-required until a user verifies every serving basis', () => {
    const result = classifyAiMealCaptureResult({
      imageEvidenceId: 'img-1',
      textHint: 'chicken rice bowl',
      reviewed: false,
      entries: [
        {
          name: 'Chicken rice bowl',
          calories: 620,
          protein: 45,
          carbs: 68,
          fat: 18,
          confidence: 0.91,
          servingBasis: 'inferred',
        },
      ],
    })

    expect(result.status).toBe('review_required')
    expect(result.entries[0].confidence).toBe(0.91)
  })

  it('promotes reviewed high-confidence photo meals to trusted-after-review', () => {
    const result = classifyAiMealCaptureResult({
      imageEvidenceId: 'img-2',
      reviewed: true,
      entries: [
        {
          name: 'Greek yogurt 250g',
          calories: 160,
          protein: 25,
          carbs: 10,
          fat: 0,
          confidence: 0.88,
          servingBasis: 'verified',
        },
      ],
    })

    expect(result.status).toBe('trusted_after_review')
  })

  it('rejects low-confidence or missing-serving AI entries from coaching proof', () => {
    const result = classifyAiMealCaptureResult({
      imageEvidenceId: 'img-3',
      reviewed: true,
      entries: [
        {
          name: 'Unknown meal',
          calories: 500,
          protein: 20,
          carbs: 55,
          fat: 15,
          confidence: 0.52,
          servingBasis: 'missing',
        },
      ],
    })

    expect(result.status).toBe('review_required')
  })

  it('builds deterministic drafts from photo filenames and keeps them editable', () => {
    const result = buildDraftAiMealCapture({
      imageEvidenceId: 'file-1',
      fileName: 'chicken-rice-250g.jpg',
    })

    expect(result.status).toBe('review_required')
    expect(result.entries[0]).toMatchObject({
      name: 'chicken rice 250g',
      servingBasis: 'verified',
    })
  })
})
