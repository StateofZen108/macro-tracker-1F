import { getSupabaseServiceClient } from './supabase.js'
import { ApiError } from '../http/errors.js'

export class SyncAuthError extends ApiError {
  constructor(code: string, message: string, status = 401) {
    super(status, code, message, { exposure: 'public' })
    this.name = 'SyncAuthError'
  }
}

function readBearerToken(request: Request): string | null {
  const headerValue = request.headers.get('Authorization') ?? request.headers.get('authorization')
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function requireAuthenticatedSyncUser(request: Request): Promise<{
  userId: string
  email?: string
}> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new SyncAuthError(
      'syncNotConfigured',
      'Supabase sync credentials are not configured for this environment.',
      503,
    )
  }

  const accessToken = readBearerToken(request)
  if (!accessToken) {
    throw new SyncAuthError('missingAuthorization', 'A valid sync session is required.')
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    throw new SyncAuthError('invalidSession', error?.message ?? 'A valid sync session is required.')
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? undefined,
  }
}
