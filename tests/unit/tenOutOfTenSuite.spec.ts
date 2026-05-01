import { describe, expect, it } from 'vitest'
import {
  buildTenOutOfTenEnv,
  derivePendingExternalFromArtifact,
  resolveTenOutOfTenPlan,
  validateTenReportShape,
} from '../../scripts/run-10-out-of-10-suite.mjs'

describe('10/10 suite orchestration', () => {
  it('uses the paid PWA preview preset and keeps AI meal photo retired', () => {
    const env = buildTenOutOfTenEnv({
      env: {},
      mode: 'local',
      gitSha: '1234567890abcdef',
    })

    expect(env.VITE_APP_FEATURE_PRESET).toBe('paid-cut-os-preview')
    expect(env.VITE_FF_AI_MEAL_CAPTURE_V1).toBe('false')
    expect(env.VITE_APP_BUILD_ID).toBe('local-10-1234567890ab')
  })

  it('maps every 10/10 predicate to an executable local rail without AI meal capture scripts', () => {
    const plan = resolveTenOutOfTenPlan({ mode: 'local' })
    expect(plan.map((rail) => rail.id)).toEqual(
      expect.arrayContaining([
        'daily_loop_unbreakable',
        'food_logging_trust_superior',
        'coach_local_paid_superior',
        'cut_engine_validated',
        'production_operable',
        'physical_device_verified',
        'paid_account_ready',
        'support_recovery_ready',
        'visual_polish_verified',
      ]),
    )

    const commandList = plan.flatMap((rail) => rail.commands).join(' ')
    expect(commandList).not.toMatch(/ai-meal|meal-ai|aiMeal/i)
  })

  it('requires strict production proof in production mode', () => {
    const plan = resolveTenOutOfTenPlan({ mode: 'production' })
    const productionRail = plan.find((rail) => rail.id === 'production_operable')
    expect(productionRail?.commands).toContain('test:release:proof')
  })

  it('reports pending external proof from existing artifacts', () => {
    const reason = derivePendingExternalFromArtifact('missing-artifact-for-unit-test.json')
    expect(reason).toBeNull()
  })

  it('validates the public 10/10 report shape', () => {
    const errors = validateTenReportShape({
      buildId: 'build-1',
      gitSha: 'abc',
      checkedAt: new Date().toISOString(),
      target: 'paid_pwa',
      rails: resolveTenOutOfTenPlan({ mode: 'local' }).map((rail) => ({
        id: rail.id,
        status: 'passed',
        evidence: rail.evidence,
      })),
    })

    expect(errors).toEqual([])
  })
})
