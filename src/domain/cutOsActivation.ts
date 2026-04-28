import type {
  CutOsActivationAction,
  CutOsActivationModel,
  CutOsActivationProofReceiptItem,
  CutOsActivationState,
  CutOsSetupChecklistItem,
  CutOsSurfaceModel,
} from '../types'
import { addDays } from '../utils/dates'

const SETUP_PRIORITY = [
  'import_or_backfill',
  'history_days',
  'logged_intake_days',
  'weigh_ins',
  'training_plan',
  'food_trust',
]

function routeAction(
  id: CutOsActivationAction['id'],
  label: string,
  detail: string,
  target: NonNullable<CutOsActivationAction['target']>,
  options: Pick<CutOsActivationAction, 'settingsFocusTarget' | 'autoOpenFilePicker'> = {},
): CutOsActivationAction {
  return {
    id,
    kind: 'route',
    label,
    detail,
    target,
    ...options,
  }
}

function startDemoAction(): CutOsActivationAction {
  return {
    id: 'try_demo',
    kind: 'start_demo',
    label: 'Try demo cut',
    detail: 'Open a sealed sample athlete and see the full command/proof loop now.',
  }
}

function exitDemoAction(): CutOsActivationAction {
  return {
    id: 'exit_demo',
    kind: 'exit_demo',
    label: 'Exit demo',
    detail: 'Return to your real local data.',
  }
}

function actionForSetupItem(item: CutOsSetupChecklistItem | null): CutOsActivationAction {
  if (!item) {
    return routeAction(
      'start_logging',
      'Log today cleanly',
      'Keep the next proof window usable.',
      'log',
    )
  }

  if (item.id === 'history_days' || item.id === 'import_or_backfill') {
    return routeAction(
      'import_history',
      'Import MacroFactor history',
      'Turn old food and weight rows into a Cut OS replay.',
      'settings',
      { settingsFocusTarget: 'macrofactor_history_import', autoOpenFilePicker: true },
    )
  }

  if (item.id === 'weigh_ins') {
    return routeAction(
      'add_weigh_in',
      'Add weigh-in',
      'Give the scale-lie detector enough signal.',
      'weigh_in',
    )
  }

  if (item.id === 'training_plan') {
    return routeAction(
      'set_training',
      'Set training contract',
      'Connect the cut to strength preservation.',
      'train',
    )
  }

  if (item.id === 'food_trust') {
    return routeAction(
      'review_food',
      'Clear food blockers',
      'Make logged food coaching-grade before the next decision.',
      'review_food',
    )
  }

  return routeAction(
    'start_logging',
    'Start logging today',
    'Create the first clean intake proof.',
    'log',
  )
}

function buildProofReceipt(setup: CutOsSetupChecklistItem[]): CutOsActivationProofReceiptItem[] {
  return setup.map((item) => ({
    id: item.id,
    label: item.label,
    detail: item.detail,
    status:
      item.status === 'complete'
        ? 'ready'
        : item.id === 'food_trust' && item.routeTarget === 'review_food'
          ? 'blocked'
          : 'pending',
  }))
}

function selectNextProof(setup: CutOsSetupChecklistItem[]): CutOsSetupChecklistItem | null {
  const pending = setup.filter((item) => item.status === 'pending')
  if (!pending.length) {
    return null
  }

  return (
    [...pending].sort((left, right) => {
      const leftIndex = SETUP_PRIORITY.indexOf(left.id)
      const rightIndex = SETUP_PRIORITY.indexOf(right.id)
      return (leftIndex === -1 ? SETUP_PRIORITY.length : leftIndex) -
        (rightIndex === -1 ? SETUP_PRIORITY.length : rightIndex)
    })[0] ?? null
  )
}

export function buildCutOsDemoSurfaceModel(date: string): CutOsSurfaceModel {
  const proofWindowStart = addDays(date, -13)
  const trainingWindowStart = addDays(date, -6)
  const proofs: CutOsSurfaceModel['proofs'] = [
    {
      id: `demo-scale:${date}:true_stall`,
      source: 'scale',
      title: 'Scale-lie detector',
      summary: 'Two clean slow-loss windows are present, and waist is flat, so this is a real stall.',
      evidenceWindow: { start: proofWindowStart, end: date },
      strength: 'high',
      blocking: false,
    },
    {
      id: `demo-training:${date}:preserved`,
      source: 'training',
      title: 'Training preservation contract',
      summary: 'Squat performance is flat and the volume floor is met, so steps beat a calorie cut.',
      evidenceWindow: { start: trainingWindowStart, end: date },
      strength: 'high',
      blocking: false,
    },
    {
      id: `demo-food:${date}:trusted`,
      source: 'food_trust',
      title: 'Food trust',
      summary: 'Barcode and reviewed custom foods cover the decision window with no unresolved blockers.',
      evidenceWindow: { start: proofWindowStart, end: date },
      strength: 'high',
      blocking: false,
    },
    {
      id: `demo-coaching:${date}:packet`,
      source: 'coaching',
      title: 'Weekly coaching packet',
      summary: 'The cut is slow enough to act, but training is preserved, so the first move is steps.',
      evidenceWindow: { start: addDays(date, -6), end: date },
      strength: 'high',
      blocking: false,
    },
  ]
  const proofIds = proofs.map((proof) => proof.id)
  const diagnosisId = `cut-os-demo:${date}:true-stall`
  const generatedAt = `${date}T09:00:00.000Z`

  const setup: CutOsSetupChecklistItem[] = [
    {
      id: 'history_days',
      label: 'History window',
      detail: '14/14 calendar days with local proof.',
      current: 14,
      target: 14,
      status: 'complete',
      routeTarget: 'settings',
    },
    {
      id: 'logged_intake_days',
      label: 'Logged intake',
      detail: '12/10 logged intake days.',
      current: 10,
      target: 10,
      status: 'complete',
      routeTarget: 'log',
    },
    {
      id: 'weigh_ins',
      label: 'Weigh-ins',
      detail: '9/8 weigh-ins.',
      current: 8,
      target: 8,
      status: 'complete',
      routeTarget: 'weigh_in',
    },
    {
      id: 'training_plan',
      label: 'Training contract',
      detail: 'Active workout plan is available for strength preservation.',
      current: 1,
      target: 1,
      status: 'complete',
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
      detail: 'Imported proof is replayed without replacing local records.',
      current: 1,
      target: 1,
      status: 'complete',
      routeTarget: 'settings',
    },
  ]

  return {
    generatedAt,
    diagnosis: {
      verdict: 'true_stall',
      reasonCodes: ['demo_true_stall', 'training_preserved', 'food_trusted'],
      blockedBy: [],
      scaleVerdict: 'true_stall',
      trainingVerdict: 'preserved',
      phaseVerdict: 'standard_cut',
      foodTrustVerdict: 'trusted_for_coaching',
    },
    command: {
      date,
      state: 'command_issued',
      primaryAction: 'Raise steps before cutting calories',
      urgency: 'medium',
      confidence: 'high',
      diagnosisId,
      proofIds,
      cta: { label: 'Open coach packet', target: 'coach' },
      secondaryActions: [
        {
          label: 'Open fast log',
          target: 'log',
          reason: 'Logging stays the first daily action.',
        },
        {
          label: 'Review training contract',
          target: 'train',
          reason: 'Training protection is why calories are held.',
        },
      ],
    },
    proofs,
    setup,
    activeAction: null,
    actionHistory: [
      {
        id: `demo-action:${date}`,
        commandId: diagnosisId,
        diagnosisId,
        date: addDays(date, -7),
        actionTarget: 'coach',
        status: 'applied',
        createdAt: `${addDays(date, -7)}T09:00:00.000Z`,
        updatedAt: `${addDays(date, -7)}T09:02:00.000Z`,
        appliedAt: `${addDays(date, -7)}T09:02:00.000Z`,
      },
    ],
  }
}

export function buildCutOsActivationModel(input: {
  date: string
  surface: CutOsSurfaceModel | null
  activationState: CutOsActivationState
}): CutOsActivationModel | null {
  if (input.activationState.demoActive) {
    const demoSurface = buildCutOsDemoSurfaceModel(input.date)
    return {
      state: 'demo_active',
      headline: 'Demo Cut OS is sealed',
      summary: 'This sample command uses no real food, weight, workout, or settings data. Exit demo to return to your local records.',
      primaryAction: routeAction(
        'open_coach',
        'Open demo coach packet',
        'See the same command, proofs, blockers, and action history used across the app.',
        'coach',
      ),
      secondaryActions: [
        exitDemoAction(),
        routeAction(
          'import_history',
          'Import my history',
          'Replace the sample with your MacroFactor replay.',
          'settings',
          { settingsFocusTarget: 'macrofactor_history_import', autoOpenFilePicker: true },
        ),
      ],
      proofReceipt: buildProofReceipt(demoSurface.setup),
      nextProof: null,
      demoSurface,
    }
  }

  if (!input.surface || (input.surface.command.state !== 'setup_required' && input.surface.command.state !== 'collecting_proof')) {
    return null
  }

  const nextProof = selectNextProof(input.surface.setup)
  const primaryAction = actionForSetupItem(nextProof)
  const secondaryActions: CutOsActivationAction[] = [
    startDemoAction(),
    primaryAction.id === 'start_logging'
      ? routeAction(
          'import_history',
          'Import MacroFactor history',
          'Backfill enough proof to skip the waiting period.',
          'settings',
          { settingsFocusTarget: 'macrofactor_history_import', autoOpenFilePicker: true },
        )
      : routeAction(
          'start_logging',
          'Start logging today',
          'Create a clean local proof day right now.',
          'log',
        ),
  ]

  return {
    state: 'needs_proof',
    headline: 'Build your Cut OS in 10 minutes',
    summary:
      'Import history or run the sealed demo to see the daily command, proof stack, blocker list, and next action before you commit to logging from scratch.',
    primaryAction,
    secondaryActions,
    proofReceipt: buildProofReceipt(input.surface.setup),
    nextProof,
    demoSurface: null,
  }
}
