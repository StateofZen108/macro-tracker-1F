import { fileURLToPath } from 'node:url'

function read(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function buildUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function runGarminLiveSmoke(env = process.env, fetchImpl = fetch) {
  const baseUrl = read(env.GARMIN_SMOKE_BASE_URL) || read(env.PRODUCTION_BASE_URL) || read(env.VERCEL_PREVIEW_URL)
  const accessToken = read(env.GARMIN_SMOKE_USER_ACCESS_TOKEN)
  const requireConnected = isTruthy(env.GARMIN_SMOKE_EXPECT_CONNECTED ?? 'true')
  const requireBackground = isTruthy(env.GARMIN_SMOKE_REQUIRE_BACKGROUND ?? 'true')
  const runSync = isTruthy(env.GARMIN_SMOKE_RUN_SYNC ?? 'true')
  const errors = []

  if (!baseUrl) {
    errors.push('GARMIN_SMOKE_BASE_URL, PRODUCTION_BASE_URL, or VERCEL_PREVIEW_URL is required.')
  }
  if (!accessToken) {
    errors.push('GARMIN_SMOKE_USER_ACCESS_TOKEN is required for authenticated Garmin live smoke.')
  }
  if (errors.length) {
    return { ok: false, errors }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }

  const statusResponse = await fetchImpl(buildUrl(baseUrl, '/api/garmin/status'), {
    method: 'GET',
    headers,
  })
  const statusPayload = await readJson(statusResponse)
  if (!statusResponse.ok) {
    return {
      ok: false,
      statusCode: statusResponse.status,
      errors: [`Garmin status smoke failed with HTTP ${statusResponse.status}.`],
      statusPayload,
    }
  }

  if (statusPayload?.providerConfigured !== true) {
    errors.push('Garmin status reports providerConfigured=false.')
  }
  if (statusPayload?.persistentStoreConfigured !== true) {
    errors.push('Garmin status reports persistentStoreConfigured=false.')
  }
  if (requireBackground && statusPayload?.backgroundAutomationEnabled !== true) {
    errors.push('Garmin status reports backgroundAutomationEnabled=false.')
  }
  if (requireConnected && statusPayload?.connection?.status !== 'connected') {
    errors.push(`Garmin smoke user is not connected: ${statusPayload?.connection?.status ?? '<missing>'}.`)
  }

  let syncPayload = null
  if (runSync && errors.length === 0) {
    const syncResponse = await fetchImpl(buildUrl(baseUrl, '/api/garmin/sync'), {
      method: 'POST',
      headers,
    })
    syncPayload = await readJson(syncResponse)
    if (!syncResponse.ok) {
      errors.push(`Garmin sync smoke failed with HTTP ${syncResponse.status}.`)
    }
    if (syncResponse.ok && !syncPayload?.connection) {
      errors.push('Garmin sync smoke did not return a connection payload.')
    }
  }

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    baseUrl,
    status: statusPayload?.connection?.status ?? null,
    providerConfigured: statusPayload?.providerConfigured === true,
    persistentStoreConfigured: statusPayload?.persistentStoreConfigured === true,
    backgroundAutomationEnabled: statusPayload?.backgroundAutomationEnabled === true,
    syncedRecords: Array.isArray(syncPayload?.records) ? syncPayload.records.length : undefined,
    errors,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runGarminLiveSmoke()
  if (!result.ok) {
    console.error('Garmin live smoke failed:')
    for (const error of result.errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log(`Garmin live smoke verified: ${result.status}.`)
}
