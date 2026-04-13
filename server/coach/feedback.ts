export interface CoachFeedbackPayload {
  messageId: string
  rating: 'up' | 'down'
  appliedActions: string[]
}

export async function recordCoachFeedback(payload: CoachFeedbackPayload) {
  return {
    ok: true,
    savedAt: new Date().toISOString(),
    payload,
  }
}
