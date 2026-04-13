import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null | undefined

export function getSupabaseBrowserConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return null
  }

  return { url, anonKey }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseBrowserConfig() !== null
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseBrowserConfig()
  if (!config) {
    return null
  }

  if (browserClient !== undefined) {
    return browserClient
  }

  browserClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: 'pkce',
    },
  })

  return browserClient
}

export function buildMagicLinkRedirectUrl(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('auth_callback', '1')
  return url.toString()
}

export function hasAuthCallbackQuery(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const params = new URLSearchParams(window.location.search)
  return (
    params.has('auth_callback') ||
    params.has('code') ||
    params.has('access_token') ||
    params.has('refresh_token') ||
    params.has('error_description')
  )
}

export function clearAuthCallbackQuery(): void {
  if (typeof window === 'undefined' || !hasAuthCallbackQuery()) {
    return
  }

  const url = new URL(window.location.href)
  url.search = ''
  window.history.replaceState({}, document.title, url.toString())
}

export function getSessionAccessToken(session: Session | null): string | null {
  const accessToken = session?.access_token?.trim()
  return accessToken ? accessToken : null
}
