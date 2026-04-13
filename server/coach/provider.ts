export type CoachProviderName = 'gemini' | 'openai' | 'anthropic'

export interface CoachProviderRequest {
  question: string
  mode: 'standard' | 'deep'
  context: Record<string, unknown>
  thread: Array<Record<string, unknown>>
}

export interface CoachProviderResponse {
  answer: string
  answerType:
    | 'data-aware'
    | 'general-evidence'
    | 'insufficient-data'
    | 'safety-limited'
    | 'not-configured'
  citations: Array<Record<string, unknown>>
  proposals: Array<Record<string, unknown>>
  safetyFlags: Array<Record<string, unknown>>
  contextUsed: string[]
}

export interface CoachProviderAdapter {
  name: CoachProviderName
  isConfigured(): boolean
  respond(input: CoachProviderRequest): Promise<CoachProviderResponse>
}

export function buildNotConfiguredResponse(provider: CoachProviderName): CoachProviderResponse {
  return {
    answer: `The ${provider} provider scaffold exists, but no live API credentials are configured for this environment yet.`,
    answerType: 'not-configured',
    citations: [],
    proposals: [],
    safetyFlags: [
      {
        id: 'provider-not-configured',
        severity: 'info',
        message: 'Add provider credentials later to enable live coach answers.',
      },
    ],
    contextUsed: ['Provider scaffold only'],
  }
}
