import { buildTrustRepairTasks } from './foodTrust'
import { buildCommandConsistencyReport, buildCommandSurfaceSnapshot } from './surfaceConsistency'
import type {
  CommandConsistencyReport,
  CutOsActionTarget,
  CutOsSurfaceModel,
  DailyGuardrail,
  DailyGuardrailRoute,
  DailyMistakeProofModel,
  FoodLogEntry,
  FoodReviewItem,
  TrustRepairTask,
  WeightEntry,
} from '../types'

function routeForActionTarget(target: CutOsActionTarget): DailyGuardrailRoute {
  switch (target) {
    case 'weigh_in':
    case 'body_progress':
      return 'weight'
    case 'train':
      return 'workouts'
    case 'coach':
    case 'hold':
      return 'coach'
    case 'phase':
    case 'settings':
      return 'settings'
    case 'log':
    case 'review_food':
    default:
      return 'log'
  }
}

function repairReasonLabel(task: TrustRepairTask): string {
  switch (task.reasonCode) {
    case 'missing_macros':
      return 'macros are missing'
    case 'missing_serving_basis':
      return 'serving basis is not verified'
    case 'provider_conflict':
      return 'provider macros conflict'
    case 'low_confidence':
      return 'confidence is too low'
    case 'unreviewed_ai':
      return 'AI food needs review'
    case 'impossible_value':
      return 'the logged value is impossible'
    default:
      return 'food trust needs review'
  }
}

function hasWeightForDate(weights: readonly WeightEntry[], date: string): boolean {
  return weights.some((entry) => entry.date === date && !entry.deletedAt)
}

function buildDefaultConsistency(surface: CutOsSurfaceModel | null): CommandConsistencyReport {
  const surfaces = (['dashboard', 'log', 'weight', 'coach'] as const).map((name) =>
    buildCommandSurfaceSnapshot(name, surface),
  )
  return buildCommandConsistencyReport({ surfaces })
}

export function buildDailyMistakeProofModel(input: {
  date: string
  surface: CutOsSurfaceModel | null
  entries?: FoodLogEntry[]
  foodReviewQueue?: FoodReviewItem[]
  weights?: WeightEntry[]
  surfaceConsistency?: CommandConsistencyReport
  now?: string
}): DailyMistakeProofModel {
  const surfaceConsistency = input.surfaceConsistency ?? buildDefaultConsistency(input.surface)
  const trustRepairs = buildTrustRepairTasks({
    date: input.date,
    entries: input.entries ?? [],
    foodReviewQueue: input.foodReviewQueue ?? [],
  })
  const blockingTrustRepairs = trustRepairs.filter((task) => task.status === 'open' && task.blockingCoachProof)
  const guardrails: DailyGuardrail[] = []
  const commandId = input.surface ? `${input.surface.command.date}:${input.surface.command.diagnosisId}` : undefined

  if (surfaceConsistency.status === 'mismatch') {
    guardrails.push({
      id: `surface-mismatch:${input.date}`,
      date: input.date,
      severity: 'block',
      source: 'sync',
      title: 'Daily command mismatch',
      reason: surfaceConsistency.mismatchReasons[0] ?? 'One screen disagrees with the shared Cut OS command.',
      cta: { label: 'Open Coach packet', route: 'coach' },
      proofIds: input.surface?.command.proofIds ?? [],
    })
  }

  if (blockingTrustRepairs.length > 0) {
    const primaryRepair = blockingTrustRepairs[0]
    guardrails.push({
      id: `food-repair:${input.date}`,
      date: input.date,
      severity: 'block',
      source: 'food',
      title: 'Repair food trust before escalation',
      reason: `${blockingTrustRepairs.length} logged item${
        blockingTrustRepairs.length === 1 ? '' : 's'
      } cannot support coaching proof because ${repairReasonLabel(primaryRepair)}.`,
      cta: { label: 'Review food', route: 'log', targetId: primaryRepair.logEntryId },
      proofIds: ['food-trust'],
    })
  }

  if (input.surface?.diagnosis.foodTrustVerdict !== undefined && input.surface.diagnosis.foodTrustVerdict !== 'trusted_for_coaching') {
    guardrails.push({
      id: `food-verdict:${input.date}`,
      date: input.date,
      severity: input.surface.diagnosis.foodTrustVerdict === 'logging_incomplete' ? 'block' : 'warn',
      source: 'food',
      title: 'Food proof is not coaching-grade',
      reason:
        input.surface.diagnosis.foodTrustVerdict === 'logging_incomplete'
          ? 'The decision window has missing or incomplete food proof.'
          : 'Food review is still required before a harder-cut command is allowed.',
      cta: { label: 'Fix food proof', route: 'log' },
      proofIds: input.surface.command.proofIds.filter((proofId) => proofId.includes('food')),
    })
  }

  if (input.surface?.command.state === 'blocked') {
    guardrails.push({
      id: `cut-os-blocked:${input.date}`,
      date: input.date,
      severity: 'block',
      source: input.surface.diagnosis.trainingVerdict === 'leaking' ? 'training' : 'coach',
      title: 'Cut OS blocked escalation',
      reason:
        input.surface.diagnosis.blockedBy.length > 0
          ? input.surface.diagnosis.blockedBy.join(', ').replaceAll('_', ' ')
          : 'The current command is blocked by proof quality.',
      cta: {
        label: input.surface.command.cta.label,
        route: routeForActionTarget(input.surface.command.cta.target),
      },
      proofIds: input.surface.command.proofIds,
    })
  }

  if (input.surface && !hasWeightForDate(input.weights ?? [], input.date)) {
    guardrails.push({
      id: `weight-stale:${input.date}`,
      date: input.date,
      severity: 'warn',
      source: 'weight',
      title: 'Scale proof can get fresher',
      reason: 'No weigh-in is logged for the selected day, so a fresh weight may change the command.',
      cta: { label: 'Add weigh-in', route: 'weight' },
      proofIds: input.surface.command.proofIds.filter((proofId) => proofId.includes('scale')),
    })
  }

  if (!input.surface) {
    guardrails.push({
      id: `setup-required:${input.date}`,
      date: input.date,
      severity: 'info',
      source: 'coach',
      title: 'Set up today’s proof loop',
      reason: 'Cut OS needs setup proof before it can issue one safe daily command.',
      cta: { label: 'Start setup', route: 'coach' },
      proofIds: [],
    })
  } else if (guardrails.length === 0) {
    guardrails.push({
      id: `safe-action:${input.date}`,
      date: input.date,
      severity: 'info',
      source: 'coach',
      title: 'Safe next action is ready',
      reason: input.surface.command.primaryAction,
      cta: {
        label: input.surface.command.cta.label,
        route: routeForActionTarget(input.surface.command.cta.target),
      },
      proofIds: input.surface.command.proofIds,
    })
  }

  const primaryGuardrail =
    guardrails.find((guardrail) => guardrail.severity === 'block') ??
    guardrails.find((guardrail) => guardrail.severity === 'warn') ??
    guardrails[0] ??
    null
  const readiness =
    guardrails.some((guardrail) => guardrail.severity === 'block') || surfaceConsistency.status === 'mismatch'
      ? 'blocked'
      : trustRepairs.some((task) => task.status === 'open')
        ? 'needs_repair'
        : 'ready'

  return {
    date: input.date,
    commandId,
    readiness,
    primaryGuardrail,
    guardrails,
    trustRepairs,
    surfaceConsistency,
  }
}
