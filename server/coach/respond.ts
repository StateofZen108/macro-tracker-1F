import type { CoachProviderAdapter, CoachProviderName, CoachProviderRequest } from './provider.js'
import { buildNotConfiguredResponse } from './provider.js'

class PlaceholderProvider implements CoachProviderAdapter {
  name: CoachProviderName

  constructor(name: CoachProviderName) {
    this.name = name
  }

  isConfigured(): boolean {
    return false
  }

  async respond(input: CoachProviderRequest) {
    void input
    return buildNotConfiguredResponse(this.name)
  }
}

const providers: Record<CoachProviderName, CoachProviderAdapter> = {
  gemini: new PlaceholderProvider('gemini'),
  openai: new PlaceholderProvider('openai'),
  anthropic: new PlaceholderProvider('anthropic'),
}

export async function respondToCoachRequest(input: {
  provider: CoachProviderName
  mode: 'standard' | 'deep'
  question: string
  context: Record<string, unknown>
  thread: Array<Record<string, unknown>>
}) {
  const provider = providers[input.provider]
  return provider.respond({
    question: input.question,
    mode: input.mode,
    context: input.context,
    thread: input.thread,
  })
}
