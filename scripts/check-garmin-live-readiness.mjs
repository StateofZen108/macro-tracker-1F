import { fileURLToPath } from 'node:url'

const REQUIRED_PROVIDER_ENV = [
  'GARMIN_CLIENT_ID',
  'GARMIN_CLIENT_SECRET',
  'GARMIN_REDIRECT_URI',
]

const REQUIRED_TOKEN_ENV = [
  'GARMIN_TOKEN_KEY_CURRENT_ID',
  'GARMIN_TOKEN_KEY_CURRENT',
]

const REQUIRED_DURABLE_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

function read(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function isBase64Aes256Key(value) {
  try {
    return Buffer.from(value, 'base64').byteLength === 32
  } catch {
    return false
  }
}

function normalizeBaseUrl(value) {
  const baseUrl = read(value)
  if (!baseUrl) {
    return null
  }
  try {
    const parsed = new URL(baseUrl)
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export function assessGarminLiveReadiness(env = process.env) {
  const violations = []
  const warnings = []
  const productionBaseUrl = normalizeBaseUrl(env.GARMIN_PRODUCTION_BASE_URL || env.PRODUCTION_BASE_URL)
  const redirectUri = read(env.GARMIN_REDIRECT_URI)
  const expectedRedirectUri = productionBaseUrl ? `${productionBaseUrl}/api/garmin/callback` : null

  for (const name of REQUIRED_PROVIDER_ENV) {
    if (!read(env[name])) {
      violations.push(`${name} is required for Garmin OAuth.`)
    }
  }

  if (!read(env.GARMIN_HEALTH_API_URL) && !read(env.GARMIN_ACTIVITY_API_URL)) {
    violations.push('At least one of GARMIN_HEALTH_API_URL or GARMIN_ACTIVITY_API_URL is required for Garmin sync.')
  }

  for (const name of REQUIRED_TOKEN_ENV) {
    if (!read(env[name])) {
      violations.push(`${name} is required for encrypted Garmin tokens.`)
    }
  }

  if (read(env.GARMIN_TOKEN_KEY_CURRENT) && !isBase64Aes256Key(read(env.GARMIN_TOKEN_KEY_CURRENT))) {
    violations.push('GARMIN_TOKEN_KEY_CURRENT must be a base64-encoded 32-byte key.')
  }

  const previousKeyId = read(env.GARMIN_TOKEN_KEY_PREVIOUS_ID)
  const previousKey = read(env.GARMIN_TOKEN_KEY_PREVIOUS)
  if (Boolean(previousKeyId) !== Boolean(previousKey)) {
    violations.push('GARMIN_TOKEN_KEY_PREVIOUS_ID and GARMIN_TOKEN_KEY_PREVIOUS must be supplied together.')
  }
  if (previousKey && !isBase64Aes256Key(previousKey)) {
    violations.push('GARMIN_TOKEN_KEY_PREVIOUS must be a base64-encoded 32-byte key.')
  }

  for (const name of REQUIRED_DURABLE_ENV) {
    if (!read(env[name])) {
      violations.push(`${name} is required so Garmin tokens and sync state use the durable Supabase store.`)
    }
  }

  if (read(env.GARMIN_STATE_DIR) && (isTruthy(env.VERCEL) || isTruthy(env.PRODUCTION_RELEASE_REQUIRED))) {
    violations.push('GARMIN_STATE_DIR is not accepted for production Garmin on Vercel; use Supabase durable state.')
  }

  if (expectedRedirectUri && redirectUri && redirectUri !== expectedRedirectUri) {
    violations.push(`GARMIN_REDIRECT_URI must equal ${expectedRedirectUri} for this deployment.`)
  }
  if (!productionBaseUrl) {
    warnings.push('Set GARMIN_PRODUCTION_BASE_URL or PRODUCTION_BASE_URL so callback URL registration can be checked exactly.')
  }

  if (!isTruthy(env.GARMIN_BACKGROUND_SYNC_ENABLED)) {
    violations.push('GARMIN_BACKGROUND_SYNC_ENABLED=true is required for live automatic Garmin refresh.')
  }
  if (!read(env.GARMIN_BACKGROUND_SYNC_SECRET)) {
    violations.push('GARMIN_BACKGROUND_SYNC_SECRET is required for protected Garmin background sync.')
  }

  return {
    ok: violations.length === 0,
    expectedRedirectUri,
    configured: {
      providerCredentials: REQUIRED_PROVIDER_ENV.every((name) => Boolean(read(env[name]))),
      wellnessEndpoint: Boolean(read(env.GARMIN_HEALTH_API_URL) || read(env.GARMIN_ACTIVITY_API_URL)),
      tokenEncryption: REQUIRED_TOKEN_ENV.every((name) => Boolean(read(env[name]))),
      durableSupabaseStore: REQUIRED_DURABLE_ENV.every((name) => Boolean(read(env[name]))),
      backgroundSync: isTruthy(env.GARMIN_BACKGROUND_SYNC_ENABLED) && Boolean(read(env.GARMIN_BACKGROUND_SYNC_SECRET)),
    },
    violations,
    warnings,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = assessGarminLiveReadiness()
  if (!result.ok) {
    console.error('Garmin live readiness failed:')
    for (const violation of result.violations) {
      console.error(`- ${violation}`)
    }
    for (const warning of result.warnings) {
      console.error(`- ${warning}`)
    }
    process.exit(1)
  }

  console.log('Garmin live readiness verified.')
  if (result.expectedRedirectUri) {
    console.log(`Register this exact Garmin callback URL: ${result.expectedRedirectUri}`)
  }
}
