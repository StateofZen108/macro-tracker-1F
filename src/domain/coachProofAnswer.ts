import type {
  CoachCitation,
  CoachProofAnswer,
  CoachProofAnswerInput,
  CoachSafetyFlag,
  CutOsProof,
} from '../types'

function sentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function proofCitation(proof: CutOsProof): CoachCitation {
  return {
    id: proof.id,
    label: proof.source.replace(/_/g, ' '),
    title: proof.title,
    source: 'Cut OS proof packet',
    summary: proof.summary,
    sourceType: 'App inference',
  }
}

function setupAnswer(input: CoachProofAnswerInput): CoachProofAnswer {
  const setupItems = input.cutOsSurface?.setup.filter((item) => item.status !== 'complete') ?? []
  const setupSummary =
    setupItems.length > 0
      ? setupItems
          .slice(0, 4)
          .map((item) => `${item.label}: ${item.current}/${item.target}`)
          .join('; ')
      : 'Cut OS proof is not available yet.'

  return {
    answer:
      'I cannot issue a harder-cut recommendation from the proof packet yet. ' +
      `The next paid-app action is setup, not escalation: ${setupSummary}. ` +
      'Import MacroFactor history or finish the listed proof items so the daily command can separate a true stall from noise.',
    answerType: 'insufficient-data',
    citations: [
      {
        id: 'cut-os-setup',
        label: 'setup',
        title: 'Cut OS setup checklist',
        source: 'Cut OS proof packet',
        summary: setupSummary,
        sourceType: 'App inference',
      },
    ],
    proposals: [],
    safetyFlags: [
      {
        id: 'cut-os-setup-incomplete',
        severity: 'blocked',
        message: 'No fat-loss escalation is supported until Cut OS setup proof is complete.',
      },
    ],
    contextUsed: [
      `Question: ${input.question.trim()}`,
      `Selected date ${input.contextSnapshot.selectedDate}`,
      'Cut OS setup checklist',
    ],
  }
}

function repairAnswer(input: CoachProofAnswerInput): CoachProofAnswer {
  const guardrails = input.cutOsSurface?.dailyGuardrails
  const primary = guardrails?.primaryGuardrail
  const repairSummary =
    guardrails?.trustRepairs.length
      ? `${guardrails.trustRepairs.length} food trust repair task${
          guardrails.trustRepairs.length === 1 ? '' : 's'
        } are open.`
      : 'The active daily guardrail needs to be cleared before escalation.'
  const title = primary?.title ?? 'Daily guardrail blocks escalation'
  const reason = primary?.reason ?? repairSummary
  const action = primary?.cta.label ?? 'Fix the active guardrail'

  return {
    answer:
      `I would not escalate the cut from this packet yet. ${title}: ${sentence(reason)} ` +
      `The next action is "${action}", then I will recompute the daily command from the repaired proof. ` +
      'Calories, macros, phases, and workouts stay unchanged from this answer.',
    answerType: 'safety-limited',
    citations: [
      {
        id: primary?.id ?? 'daily-guardrail',
        label: 'daily guardrail',
        title,
        source: 'Cut OS proof packet',
        summary: reason,
        sourceType: 'App inference',
      },
    ],
    proposals: [],
    safetyFlags: [
      {
        id: 'daily-guardrail-active',
        severity: primary?.severity === 'block' ? 'blocked' : 'warning',
        message: 'No harder-cut advice is supported while a daily guardrail is active.',
      },
    ],
    contextUsed: [
      `Question: ${input.question.trim()}`,
      `Selected date ${input.contextSnapshot.selectedDate}`,
      `Daily readiness ${guardrails?.readiness ?? 'blocked'}`,
      repairSummary,
    ],
  }
}

export function buildCoachProofAnswer(input: CoachProofAnswerInput): CoachProofAnswer {
  const surface = input.cutOsSurface
  if (
    !surface ||
    surface.command.state === 'setup_required' ||
    surface.command.state === 'collecting_proof'
  ) {
    return setupAnswer(input)
  }

  if (
    surface.dailyGuardrails &&
    (surface.dailyGuardrails.readiness === 'blocked' ||
      surface.dailyGuardrails.trustRepairs.some((task) => task.status === 'open' && task.blockingCoachProof))
  ) {
    return repairAnswer(input)
  }

  const proofById = new Map(surface.proofs.map((proof) => [proof.id, proof]))
  const commandProofs = surface.command.proofIds
    .map((proofId) => proofById.get(proofId))
    .filter((proof): proof is CutOsProof => Boolean(proof))
  const missingProofIds = surface.command.proofIds.filter((proofId) => !proofById.has(proofId))
  const blockingProofs = commandProofs.filter((proof) => proof.blocking)
  const latestAction = surface.actionHistory[0] ?? null
  const safetyFlags: CoachSafetyFlag[] = []

  if (missingProofIds.length > 0) {
    safetyFlags.push({
      id: 'cut-os-proof-citation-missing',
      severity: 'warning',
      message: `Cut OS referenced proof IDs that were not present in the packet: ${missingProofIds.join(', ')}.`,
    })
  }

  if (surface.command.state === 'blocked' || blockingProofs.length > 0) {
    safetyFlags.push({
      id: 'cut-os-blocked',
      severity: 'blocked',
      message: 'The command is blocked; do not escalate calories or steps until the blocker is resolved.',
    })
  }

  const proofSummary = commandProofs.length > 0
    ? commandProofs
        .slice(0, 3)
        .map((proof) => `${proof.title}: ${proof.summary}`)
        .join(' ')
    : 'No supporting proof IDs were available in the command packet.'
  const blockerSummary =
    surface.diagnosis.blockedBy.length > 0
      ? `Blockers: ${surface.diagnosis.blockedBy.join(', ')}.`
      : 'No active Cut OS blockers are attached to this command.'
  const actionSummary = latestAction
    ? `Latest action history: ${latestAction.actionTarget} is ${latestAction.status}.`
    : 'No prior Cut OS action has been applied or deferred for this command.'

  const answer = [
    `Cut OS proof packet for ${surface.command.date}: ${sentence(surface.command.primaryAction)}`,
    `Today I would use the command CTA "${surface.command.cta.label}" because diagnosis ${surface.command.diagnosisId} is ${surface.diagnosis.verdict} with ${surface.command.confidence} confidence and ${surface.command.urgency} urgency.`,
    'What would change my mind: a newly trusted food-review resolution, a fresh weigh-in that changes the scale verdict, or training evidence showing strength leakage would force a new command before escalation.',
    'I am not changing targets, logs, phases, or workouts from this answer. Use the explicit Cut OS action button if you want to apply the recommendation.',
    sentence(proofSummary),
    sentence(blockerSummary),
    sentence(actionSummary),
  ]
    .filter(Boolean)
    .join(' ')

  return {
    answer,
    answerType: 'data-aware',
    citations: commandProofs.map(proofCitation),
    proposals: [],
    safetyFlags,
    contextUsed: [
      `Question: ${input.question.trim()}`,
      `Mode: ${input.mode}`,
      `Selected date ${input.contextSnapshot.selectedDate}`,
      `Cut OS diagnosis ${surface.command.diagnosisId}`,
      `${commandProofs.length} cited proof IDs`,
      `${surface.actionHistory.length} action history records`,
    ],
  }
}
