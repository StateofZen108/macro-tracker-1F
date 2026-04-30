import { describe, expect, it } from 'vitest'
import { buildCommandConsistencyReport } from '../../src/domain/surfaceConsistency'
import type { CommandSurfaceSnapshot } from '../../src/types'

function surface(overrides: Partial<CommandSurfaceSnapshot> = {}): CommandSurfaceSnapshot {
  return {
    surface: 'dashboard',
    commandId: '2026-04-29:diagnosis-1',
    diagnosisId: 'diagnosis-1',
    primaryAction: 'Hold calories and repair proof',
    proofIds: ['proof-food', 'proof-scale'],
    actionStatus: 'none',
    setupItemIds: [],
    ...overrides,
  }
}

describe('surface consistency guard', () => {
  it('verifies aligned command surfaces', () => {
    const report = buildCommandConsistencyReport({
      checkedAt: '2026-04-29T08:00:00.000Z',
      surfaces: [
        surface({ surface: 'dashboard' }),
        surface({ surface: 'log' }),
        surface({ surface: 'weight' }),
        surface({ surface: 'coach' }),
      ],
    })

    expect(report.status).toBe('verified')
    expect(report.mismatchReasons).toEqual([])
  })

  it('reports mismatched primary actions and blocks CTA trust', () => {
    const report = buildCommandConsistencyReport({
      checkedAt: '2026-04-29T08:00:00.000Z',
      surfaces: [
        surface({ surface: 'dashboard' }),
        surface({ surface: 'coach', primaryAction: 'Cut calories now' }),
      ],
    })

    expect(report.status).toBe('mismatch')
    expect(report.mismatchReasons.join(' ')).toContain('primary action')
  })
})
