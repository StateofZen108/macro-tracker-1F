/// <reference types="node" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let serviceClient: SupabaseClient | null | undefined

export function getSupabaseServiceConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    return null
  }

  return { url, serviceRoleKey }
}

export function isSupabaseServiceConfigured(): boolean {
  return getSupabaseServiceConfig() !== null
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  const config = getSupabaseServiceConfig()
  if (!config) {
    return null
  }

  if (serviceClient !== undefined) {
    return serviceClient
  }

  serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  return serviceClient
}
