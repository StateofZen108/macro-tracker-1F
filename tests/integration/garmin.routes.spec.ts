import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedSyncUser = vi.fn()
const fakeService = {
  createConnectionSession: vi.fn(async () => ({
    authorizationUrl: 'https://garmin.example/oauth/authorize',
    state: 'state-1',
    expiresAt: '2026-04-13T12:15:00.000Z',
    connection: {
      userId: 'user-1',
      status: 'not_connected',
      createdAt: '2026-04-13T12:00:00.000Z',
      updatedAt: '2026-04-13T12:00:00.000Z',
      failureCount: 0,
      lastWatermarks: {},
      staleData: false,
    },
  })),
  completeConnectionFromCallback: vi.fn(async () => ({
    userId: 'user-1',
    status: 'connected',
    createdAt: '2026-04-13T12:00:00.000Z',
    updatedAt: '2026-04-13T12:00:00.000Z',
    connectedAt: '2026-04-13T12:00:00.000Z',
    failureCount: 0,
    lastWatermarks: {},
    staleData: false,
  })),
  getSession: vi.fn(async () => ({
    state: 'state-1',
    userId: 'user-1',
    codeVerifier: 'verifier',
    redirectUri: 'https://macrotracker-mf.vercel.app/api/garmin/callback',
    returnToUrl: 'https://macrotracker-mf.vercel.app/settings',
    createdAt: '2026-04-13T12:00:00.000Z',
    expiresAt: '2026-04-13T12:15:00.000Z',
  })),
  getConnectionStatus: vi.fn(async () => ({
    connection: {
      userId: 'user-1',
      status: 'connected',
      createdAt: '2026-04-13T12:00:00.000Z',
      updatedAt: '2026-04-13T12:00:00.000Z',
      connectedAt: '2026-04-13T12:00:00.000Z',
      failureCount: 0,
      lastWatermarks: {},
      staleData: false,
    },
    staleData: false,
    providerConfigured: true,
    persistentStoreConfigured: true,
    backgroundAutomationEnabled: true,
    automationMode: 'server_background',
  })),
  syncConnection: vi.fn(async () => ({
    records: [],
    connection: {
      userId: 'user-1',
      status: 'connected',
      createdAt: '2026-04-13T12:00:00.000Z',
      updatedAt: '2026-04-13T12:00:00.000Z',
      connectedAt: '2026-04-13T12:00:00.000Z',
      failureCount: 0,
      lastWatermarks: {},
      staleData: false,
    },
    window: {
      startDate: '2026-03-14',
      endDate: '2026-04-13',
      initialBackfill: true,
    },
  })),
  runBackgroundSync: vi.fn(async () => ({
    startedAt: '2026-04-13T12:00:00.000Z',
    finishedAt: '2026-04-13T12:00:02.000Z',
    scannedUsers: 1,
    syncedUsers: 1,
    skippedUsers: 0,
    failedUsers: 0,
  })),
  disconnectConnection: vi.fn(async () => ({
    userId: 'user-1',
    status: 'not_connected',
    createdAt: '2026-04-13T12:00:00.000Z',
    updatedAt: '2026-04-13T12:00:00.000Z',
    failureCount: 0,
    lastWatermarks: {},
    staleData: false,
  })),
}

class MockSyncAuthError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'SyncAuthError'
    this.status = status
    this.code = code
  }
}

vi.mock('../../server/sync/auth.js', () => ({
  requireAuthenticatedSyncUser,
  SyncAuthError: MockSyncAuthError,
}))

vi.mock('../../server/garmin/service.js', () => ({
  getGarminService: () => fakeService,
  GarminServiceError: class extends Error {
    status: number
    code: string

    constructor(code: string, message: string, status = 502) {
      super(message)
      this.name = 'GarminServiceError'
      this.code = code
      this.status = status
    }
  },
}))

function buildRequest(
  method: 'GET' | 'POST',
  url: string,
  authorization: string | undefined = 'Bearer token-1',
) {
  return new Request(url, {
    method,
    headers: {
      Authorization: authorization,
    },
  })
}

describe('garmin api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthenticatedSyncUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
    })
  })

  it('returns a Garmin connect session', async () => {
    const routeModule = await import('../../api/garmin/connect')
    const response = await routeModule.default.fetch(
      buildRequest('GET', 'http://localhost/api/garmin/connect?returnTo=https://macrotracker-mf.vercel.app/settings'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      authorizationUrl: 'https://garmin.example/oauth/authorize',
      state: 'state-1',
    })
  })

  it('returns Garmin status and sync payloads', async () => {
    const statusRoute = await import('../../api/garmin/status')
    const syncRoute = await import('../../api/garmin/sync')
    const disconnectRoute = await import('../../api/garmin/disconnect')

    await expect(statusRoute.default.fetch(buildRequest('GET', 'http://localhost/api/garmin/status'))).resolves.toMatchObject({
      status: 200,
    })
    await expect(syncRoute.default.fetch(buildRequest('POST', 'http://localhost/api/garmin/sync'))).resolves.toMatchObject({
      status: 200,
    })
    await expect(
      disconnectRoute.default.fetch(buildRequest('POST', 'http://localhost/api/garmin/disconnect')),
    ).resolves.toMatchObject({
      status: 200,
    })
  })

  it('redirects callback responses back into the app', async () => {
    const callbackRoute = await import('../../api/garmin/callback')
    const response = await callbackRoute.default.fetch(
      buildRequest(
        'GET',
        'http://localhost/api/garmin/callback?code=auth-code&state=state-1',
        undefined,
      ),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain(
      'https://macrotracker-mf.vercel.app/settings?garmin_callback=connected',
    )
  })

  it('protects the background sync route with a bearer secret', async () => {
    process.env.GARMIN_BACKGROUND_SYNC_SECRET = 'sync-secret'
    const routeModule = await import('../../api/garmin/background-sync')

    const unauthorizedResponse = await routeModule.default.fetch(
      buildRequest('POST', 'http://localhost/api/garmin/background-sync', undefined),
    )
    expect(unauthorizedResponse.status).toBe(401)

    const authorizedResponse = await routeModule.default.fetch(
      buildRequest(
        'POST',
        'http://localhost/api/garmin/background-sync',
        'Bearer sync-secret',
      ),
    )
    expect(authorizedResponse.status).toBe(200)
    await expect(authorizedResponse.json()).resolves.toMatchObject({
      syncedUsers: 1,
    })
  })
})
