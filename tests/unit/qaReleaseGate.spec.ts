import { describe, expect, it } from 'vitest'
import {
  evaluateAccessibilityViolations,
  evaluateQaVerdict,
  validateAccessibilityAllowlist,
  validateQaScenarioCatalog,
} from '../../scripts/qa-release/shared.mjs'

function buildPassingScenarioResults() {
  return [
    'clean_install_baseline',
    'repeat_logging_fast_path',
    'review_queue_pending',
    'training_guidance_stale_readiness',
    'training_guidance_manual_override',
    'progress_story_missing_photo',
    'offline_local_logging_only',
    'food_catalog_5xx_fallback',
    'barcode_permission_denied',
    'export_restore_roundtrip',
  ].map((scenarioId) => ({
    scenarioId,
    laneId: 'generic_preview',
    status: 'passed',
    evidencePaths: [],
  }))
}

describe('qa release gate shared rules', () => {
  it('requires exactly one dedicated preview lane when generic preview is excluded', () => {
    const result = validateQaScenarioCatalog([
      {
        id: 'preview-only-scenario',
        owner: 'qa_owner',
        requiredLanes: ['coach_preview'],
        whyGenericExcluded: 'Scenario exists only in the coach preview bundle.',
        seedName: 'preview-only-scenario',
        failureModes: [],
        accessibilityScopes: ['main'],
        releaseClass: 'required',
      },
    ])

    expect(result.ok).toBe(true)
  })

  it('rejects wildcard accessibility allowlist entries', () => {
    const result = validateAccessibilityAllowlist([
      {
        ruleId: 'color-contrast',
        targetSelector: '.app-card *',
        scenarioId: 'clean_install_baseline',
        owner: 'qa_owner',
        reason: 'invalid wildcard',
        expiresOn: '2026-04-30',
      },
    ])

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/no wildcards/i)
  })

  it('reopens an accessibility finding when the allowlist entry is expired', () => {
    const result = evaluateAccessibilityViolations({
      scenarioId: 'repeat_logging_fast_path',
      laneId: 'generic_preview',
      allowlistEntries: [
        {
          ruleId: 'color-contrast',
          targetSelector: '[role="dialog"]',
          scenarioId: 'repeat_logging_fast_path',
          owner: 'qa_owner',
          reason: 'temporary waiver',
          expiresOn: '2026-04-01',
        },
      ],
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          help: 'Text contrast is too low.',
          nodes: [{ target: ['[role="dialog"]'] }],
        },
      ],
      evaluationDate: '2026-04-17',
    })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('major')
  })

  it('returns conditional pass only for waived minor or cosmetic findings', () => {
    const verdict = evaluateQaVerdict({
      buildId: 'qa-build',
      commitSha: 'abc123',
      evaluationDate: '2026-04-17',
      laneResults: [{ laneId: 'generic_preview', advisory: false, status: 'passed' }],
      scenarioResults: buildPassingScenarioResults(),
      findings: [
        {
          id: 'minor-1',
          scenarioId: 'clean_install_baseline',
          laneId: 'generic_preview',
          severity: 'minor',
          summary: 'Small spacing issue.',
          reproSteps: ['Open Home.'],
          evidencePaths: ['C:\\evidence\\minor.png'],
          resolutionState: 'open',
          waiver: {
            owner: 'qa_owner',
            reason: 'Tracked separately.',
            ticket: 'QA-123',
            expiresOn: '2026-04-30',
          },
        },
      ],
      manualSweep: {
        completed: true,
        operator: 'qa-operator',
        completedAt: '2026-04-17T09:30:00.000Z',
        findings: [],
      },
    })

    expect(verdict.verdict).toBe('conditional_pass')
  })

  it('does not allow a major finding to pass with a waiver', () => {
    const verdict = evaluateQaVerdict({
      buildId: 'qa-build',
      commitSha: 'abc123',
      evaluationDate: '2026-04-17',
      laneResults: [{ laneId: 'generic_preview', advisory: false, status: 'passed' }],
      scenarioResults: buildPassingScenarioResults(),
      findings: [
        {
          id: 'major-1',
          scenarioId: 'clean_install_baseline',
          laneId: 'generic_preview',
          severity: 'major',
          summary: 'Primary task needs a workaround.',
          reproSteps: ['Open Home.'],
          evidencePaths: ['C:\\evidence\\major.png'],
          resolutionState: 'open',
          waiver: {
            owner: 'qa_owner',
            reason: 'Should not count.',
            ticket: 'QA-124',
            expiresOn: '2026-04-30',
          },
        },
      ],
      manualSweep: {
        completed: true,
        operator: 'qa-operator',
        completedAt: '2026-04-17T09:30:00.000Z',
        findings: [],
      },
    })

    expect(verdict.verdict).toBe('fail')
  })
})
