import { describe, expect, it } from 'vitest'
import { buildCutOsActivationModel, buildCutOsDemoSurfaceModel } from '../../src/domain/cutOsActivation'
import type { CutOsSurfaceModel } from '../../src/types'

const date = '2026-04-14'
const baseActivationState = {
  demoActive: false,
  updatedAt: '2026-04-14T08:00:00.000Z',
}

function buildSetupSurface(overrides: Partial<CutOsSurfaceModel> = {}): CutOsSurfaceModel {
  const setup: CutOsSurfaceModel['setup'] = [
    {
      id: 'history_days',
      label: 'History window',
      detail: '0/14 calendar days with local proof.',
      current: 0,
      target: 14,
      status: 'pending',
      routeTarget: 'settings',
    },
    {
      id: 'logged_intake_days',
      label: 'Logged intake',
      detail: '0/10 logged intake days.',
      current: 0,
      target: 10,
      status: 'pending',
      routeTarget: 'log',
    },
    {
      id: 'weigh_ins',
      label: 'Weigh-ins',
      detail: '0/8 weigh-ins.',
      current: 0,
      target: 8,
      status: 'pending',
      routeTarget: 'weigh_in',
    },
    {
      id: 'training_plan',
      label: 'Training contract',
      detail: 'Add an active workout plan so Cut OS can protect performance.',
      current: 0,
      target: 1,
      status: 'pending',
      routeTarget: 'train',
    },
    {
      id: 'food_trust',
      label: 'Food trust',
      detail: 'No pending food-review blockers.',
      current: 1,
      target: 1,
      status: 'complete',
      routeTarget: 'log',
    },
    {
      id: 'import_or_backfill',
      label: 'Import or backfill',
      detail: 'Backfill history or keep logging locally until the proof base is complete.',
      current: 0,
      target: 1,
      status: 'pending',
      routeTarget: 'settings',
    },
  ]

  return {
    generatedAt: `${date}T09:00:00.000Z`,
    command: {
      date,
      state: 'setup_required',
      primaryAction: 'Build proof base',
      urgency: 'medium',
      confidence: 'low',
      diagnosisId: `cut-os:${date}:setup_required`,
      proofIds: [],
      cta: { label: 'Log today', target: 'log' },
      secondaryActions: [],
    },
    diagnosis: {
      verdict: 'setup_required',
      reasonCodes: ['minimum_history_missing'],
      blockedBy: [],
      scaleVerdict: 'insufficient_proof',
      trainingVerdict: 'insufficient_training_data',
      phaseVerdict: 'standard_cut',
      foodTrustVerdict: 'trusted_for_coaching',
    },
    proofs: [],
    setup,
    actionHistory: [],
    activeAction: null,
    ...overrides,
  }
}

describe('Cut OS activation', () => {
  it('prioritizes MacroFactor import and sealed demo for a cold user', () => {
    const model = buildCutOsActivationModel({
      date,
      surface: buildSetupSurface(),
      activationState: baseActivationState,
    })

    expect(model?.state).toBe('needs_proof')
    expect(model?.headline).toMatch(/Build your Cut OS/i)
    expect(model?.primaryAction.id).toBe('import_history')
    expect(model?.primaryAction.target).toBe('settings')
    expect(model?.primaryAction.settingsFocusTarget).toBe('macrofactor_history_import')
    expect(model?.primaryAction.autoOpenFilePicker).toBe(true)
    expect(model?.secondaryActions.map((action) => action.id)).toContain('try_demo')
    expect(model?.secondaryActions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['start_logging', 'add_weigh_in', 'set_cut_target', 'ask_coach']),
    )
    expect(model?.steps.map((step) => step.id)).toEqual([
      'import_history',
      'log_first_food',
      'set_cut_target',
      'weigh_in',
      'ask_coach',
    ])
    expect(model?.steps.find((step) => step.id === 'import_history')?.status).toBe('active')
    expect(model?.proofReceipt.find((item) => item.id === 'food_trust')?.status).toBe('ready')
  })

  it('does not compete with a real issued command', () => {
    const model = buildCutOsActivationModel({
      date,
      surface: buildSetupSurface({
        command: {
          ...buildSetupSurface().command,
          state: 'command_issued',
          primaryAction: 'Hold today\'s cut plan',
          confidence: 'high',
        },
        setup: buildSetupSurface().setup.map((item) => ({ ...item, status: 'complete', current: item.target })),
      }),
      activationState: baseActivationState,
    })

    expect(model).toBeNull()
  })

  it('builds a sealed demo command with complete proof and no setup blockers', () => {
    const demoSurface = buildCutOsDemoSurfaceModel(date)
    const activation = buildCutOsActivationModel({
      date,
      surface: null,
      activationState: {
        demoActive: true,
        updatedAt: `${date}T09:00:00.000Z`,
      },
    })

    expect(demoSurface.command.primaryAction).toBe('Raise steps before cutting calories')
    expect(demoSurface.diagnosis.scaleVerdict).toBe('true_stall')
    expect(demoSurface.setup.every((item) => item.status === 'complete')).toBe(true)
    expect(activation?.state).toBe('demo_active')
    expect(activation?.demoSurface?.command.diagnosisId).toBe(demoSurface.command.diagnosisId)
    expect(activation?.steps.every((step) => step.status === 'complete')).toBe(true)
    expect(activation?.proofReceipt.every((item) => item.status === 'ready')).toBe(true)
  })
})
