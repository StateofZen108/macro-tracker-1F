import { useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  CoachContextSnapshot,
  CoachFeedbackRating,
  CoachMode,
  CoachProofAnswer,
  CoachProviderConfig,
  CoachQueuedQuestion,
  CoachState,
  CoachThreadState,
  CoachMessage,
  CoachFeedback,
  CutOsSurfaceModel,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { buildCoachProofAnswer } from '../domain/coachProofAnswer'
import {
  loadCoachConfig,
  loadCoachFeedback,
  loadCoachQueue,
  loadCoachThread,
  saveCoachConfig,
  saveCoachFeedback,
  saveCoachQueue,
  saveCoachThread,
} from '../utils/storage/coach'
import { subscribeToStorage } from '../utils/storage/core'
import { recordDiagnosticsEvent } from '../utils/diagnostics'

const STARTER_PROMPTS = [
  'Why did my weight jump today?',
  'What calorie target do you recommend right now?',
  'Should today be partial or complete?',
  'How should fasting change my weekly targets?',
  'Are my intervention logs confounding this week’s trend?',
] as const

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function buildMessage(
  partial: Pick<CoachMessage, 'role' | 'content'> &
    Partial<Omit<CoachMessage, 'id' | 'role' | 'content' | 'createdAt'>>,
): CoachMessage {
  return {
    id: crypto.randomUUID(),
    role: partial.role,
    content: partial.content,
    createdAt: new Date().toISOString(),
    mode: partial.mode,
    state: partial.state,
    answerType: partial.answerType,
    citations: partial.citations,
    proposals: partial.proposals,
    safetyFlags: partial.safetyFlags,
    contextUsed: partial.contextUsed,
  }
}

function appendThreadMessages(
  thread: CoachThreadState,
  messages: CoachMessage[],
): ActionResult<CoachThreadState> {
  const nextThread: CoachThreadState = {
    messages: [...thread.messages, ...messages],
    updatedAt: messages.at(-1)?.createdAt ?? thread.updatedAt,
  }
  const result = saveCoachThread(nextThread)
  if (!result.ok) {
    return result as ActionResult<CoachThreadState>
  }

  return ok(nextThread)
}

export function useCoach(isOnline: boolean) {
  const coachThread = useSyncExternalStore(subscribeToStorage, loadCoachThread, loadCoachThread)
  const coachQueue = useSyncExternalStore(subscribeToStorage, loadCoachQueue, loadCoachQueue)
  const coachFeedback = useSyncExternalStore(
    subscribeToStorage,
    loadCoachFeedback,
    loadCoachFeedback,
  )
  const coachConfig = useSyncExternalStore(subscribeToStorage, loadCoachConfig, loadCoachConfig)
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  const coachState: CoachState = useMemo(() => {
    if (!isOnline) {
      return 'offline'
    }

    if (FEATURE_FLAGS.coachProofDefaultV2) {
      return coachQueue.length > 0 ? 'queued' : 'ready'
    }

    if (coachConfig.provider === 'none') {
      return 'notConfigured'
    }

    return coachQueue.length > 0 ? 'queued' : 'ready'
  }, [coachConfig.provider, coachQueue.length, isOnline])

  function updateCoachConfig(nextConfig: CoachProviderConfig): ActionResult<void> {
    const result = saveCoachConfig(nextConfig)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function queueQuestion(
    question: string,
    mode: CoachMode,
    snapshot?: CoachContextSnapshot,
  ): ActionResult<CoachQueuedQuestion> {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      const result: ActionResult<CoachQueuedQuestion> = {
        ok: false,
        error: {
          code: 'emptyQuestion',
          message: 'Enter a coach question before sending it.',
        },
      }
      setLastError(result.error)
      return result
    }

    const queuedQuestion: CoachQueuedQuestion = {
      id: crypto.randomUUID(),
      question: trimmedQuestion,
      mode,
      createdAt: new Date().toISOString(),
    }

    const queueResult = saveCoachQueue([...coachQueue, queuedQuestion])
    if (!queueResult.ok) {
      setLastError(queueResult.error)
      return queueResult as ActionResult<CoachQueuedQuestion>
    }

    const userMessage = buildMessage({
      role: 'user',
      content: trimmedQuestion,
      mode,
      state: isOnline ? 'queued' : 'offline',
      contextUsed: snapshot
        ? [
            `Selected date ${snapshot.selectedDate}`,
            `${snapshot.recentDailyCalories.length} daily summaries`,
            `${snapshot.recentWeights.length} recent weights`,
          ]
        : ['Queued locally'],
    })

    const assistantMessage = buildMessage({
      role: 'assistant',
      content:
        coachConfig.provider === 'none'
          ? 'Ask Coach is built, but no provider is configured yet. I saved this question locally so you can send it later once a provider is connected.'
          : 'This question was queued locally. Sending will be available once a live coach provider is connected to this build.',
      mode,
      state: coachConfig.provider === 'none' ? 'notConfigured' : isOnline ? 'queued' : 'offline',
      answerType: 'not-configured',
      contextUsed: [
        isOnline ? 'Online queue' : 'Offline queue',
        coachConfig.provider === 'none' ? 'Provider not configured' : 'Live provider pending',
        snapshot ? 'Context snapshot captured' : 'No context snapshot',
      ],
    })

    const threadResult = appendThreadMessages(coachThread, [userMessage, assistantMessage])
    if (!threadResult.ok) {
      setLastError(threadResult.error)
      return threadResult as ActionResult<CoachQueuedQuestion>
    }

    setLastError(null)
    return ok(queuedQuestion)
  }

  function answerQuestionWithProof(
    question: string,
    mode: CoachMode,
    snapshot: CoachContextSnapshot,
    cutOsSurface: CutOsSurfaceModel | null,
  ): ActionResult<CoachProofAnswer> {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      const result: ActionResult<CoachProofAnswer> = {
        ok: false,
        error: {
          code: 'emptyQuestion',
          message: 'Enter a coach question before sending it.',
        },
      }
      setLastError(result.error)
      return result
    }

    recordDiagnosticsEvent({
      eventType: 'coach.proof_answer_snapshot_captured',
      severity: 'info',
      scope: 'diagnostics',
      message: 'Coach proof answer captured a submit-time Cut OS snapshot.',
      payload: {
        selectedDate: snapshot.selectedDate,
        diagnosisId: cutOsSurface?.command.diagnosisId ?? null,
        commandState: cutOsSurface?.command.state ?? null,
      },
    })

    const proofAnswer = buildCoachProofAnswer({
      question: trimmedQuestion,
      mode,
      contextSnapshot: snapshot,
      cutOsSurface,
    })

    const userMessage = buildMessage({
      role: 'user',
      content: trimmedQuestion,
      mode,
      state: 'ready',
      contextUsed: [
        `Selected date ${snapshot.selectedDate}`,
        `${snapshot.recentDailyCalories.length} daily summaries`,
        `${snapshot.recentWeights.length} recent weights`,
        cutOsSurface ? 'Cut OS proof packet captured' : 'Cut OS proof packet missing',
      ],
    })

    const assistantMessage = buildMessage({
      role: 'assistant',
      content: proofAnswer.answer,
      mode,
      state: 'ready',
      answerType: proofAnswer.answerType,
      citations: proofAnswer.citations,
      proposals: proofAnswer.proposals,
      safetyFlags: proofAnswer.safetyFlags,
      contextUsed: proofAnswer.contextUsed,
    })

    const threadResult = appendThreadMessages(coachThread, [userMessage, assistantMessage])
    if (!threadResult.ok) {
      setLastError(threadResult.error)
      recordDiagnosticsEvent({
        eventType: 'coach.proof_answer_failed',
        severity: 'error',
        scope: 'diagnostics',
        message: 'Coach proof answer could not be written to the thread.',
        payload: {
          error: threadResult.error.message,
        },
      })
      return threadResult as ActionResult<CoachProofAnswer>
    }

    if (proofAnswer.safetyFlags.some((flag) => flag.id === 'cut-os-proof-citation-missing')) {
      recordDiagnosticsEvent({
        eventType: 'coach.proof_citation_missing',
        severity: 'warning',
        scope: 'diagnostics',
        message: 'Coach proof answer omitted an unsupported proof claim.',
        payload: {
          diagnosisId: cutOsSurface?.command.diagnosisId ?? null,
        },
      })
    }

    recordDiagnosticsEvent({
      eventType:
        proofAnswer.answerType === 'insufficient-data'
          ? 'coach.proof_answer_blocked'
          : 'coach.proof_answer_generated',
      severity: proofAnswer.answerType === 'insufficient-data' ? 'warning' : 'info',
      scope: 'diagnostics',
      message:
        proofAnswer.answerType === 'insufficient-data'
          ? 'Coach proof answer blocked escalation because proof was incomplete.'
          : 'Coach proof answer generated from the Cut OS packet.',
      payload: {
        diagnosisId: cutOsSurface?.command.diagnosisId ?? null,
        answerType: proofAnswer.answerType,
      },
    })

    setLastError(null)
    return ok(proofAnswer)
  }

  function clearQueuedQuestion(questionId: string): ActionResult<void> {
    const result = saveCoachQueue(coachQueue.filter((entry) => entry.id !== questionId))
    setLastError(result.ok ? null : result.error)
    return result
  }

  function rateMessage(
    messageId: string,
    rating: CoachFeedbackRating,
    appliedActions: string[] = [],
  ): ActionResult<void> {
    const nextFeedback: CoachFeedback[] = coachFeedback
      .filter((entry) => entry.messageId !== messageId)
      .concat({
        messageId,
        rating,
        appliedActions,
        createdAt: new Date().toISOString(),
      })

    const result = saveCoachFeedback(nextFeedback)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function clearThread(): ActionResult<void> {
    const result = saveCoachThread({
      messages: [],
      updatedAt: new Date().toISOString(),
    })
    setLastError(result.ok ? null : result.error)
    return result
  }

  function summarizeRecentThread(limit = 8): string[] {
    return coachThread.messages
      .slice(-limit)
      .map((message) => `${message.role}: ${message.content}`.trim())
  }

  function buildSnapshot(baseSnapshot: CoachContextSnapshot): CoachContextSnapshot {
    return {
      ...baseSnapshot,
      recentThreadSummary: summarizeRecentThread(),
    }
  }

  return {
    coachThread,
    coachQueue,
    coachFeedback,
    coachConfig,
    coachState,
    starterPrompts: [...STARTER_PROMPTS],
    queueQuestion,
    answerQuestionWithProof,
    clearQueuedQuestion,
    clearThread,
    rateMessage,
    updateCoachConfig,
    buildSnapshot,
    lastError,
  }
}
