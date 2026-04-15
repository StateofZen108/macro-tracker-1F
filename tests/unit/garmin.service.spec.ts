import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { GarminProviderError } from '../../server/garmin/provider'
import { createGarminService } from '../../server/garmin/service'
import { createGarminStateStore } from '../../server/garmin/store'

function makeBase64Key(seed: number): string {
  return Buffer.alloc(32, seed).toString('base64')
}

function createTokenKeyRing() {
  return {
    current: {
      keyId: 'current',
      key: Buffer.from(makeBase64Key(1), 'base64'),
    },
    previous: {
      keyId: 'previous',
      key: Buffer.from(makeBase64Key(2), 'base64'),
    },
  }
}

describe('garmin service state transitions', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'garmin-state-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('creates a connect session, persists encrypted tokens, and marks the connection connected', async () => {
    const provider = {
      buildAuthorizationUrl: vi.fn(() => 'https://garmin.example/oauth/authorize'),
      exchangeCodeForTokens: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      refreshAccessToken: vi.fn(async () => {
        throw new Error('not expected')
      }),
      fetchWellnessData: vi.fn(async () => ({
        wellnessEntries: [],
      })),
    }

    const store = createGarminStateStore({ stateDir: tempDir })
    const service = createGarminService({
      store,
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    const session = await service.createConnectionSession('user-1')
    expect(session.authorizationUrl).toBe('https://garmin.example/oauth/authorize')
    expect(session.state).toBeTruthy()

    const connection = await service.completeConnectionFromCallback({
      state: session.state,
      code: 'auth-code',
    })

    expect(connection.status).toBe('connected')
    expect(connection.accessToken?.keyId).toBe('current')

    const persisted = JSON.parse(readFileSync(join(tempDir, 'garmin-state.json'), 'utf8')) as {
      connections: Record<string, { accessToken?: { keyId: string } }>
    }
    expect(persisted.connections['user-1'].accessToken?.keyId).toBe('current')
  })

  it('uses a 30 day backfill window on the first sync and a 3 day overlap afterwards', async () => {
    const fetchWellnessData = vi
      .fn()
      .mockResolvedValueOnce({
        wellnessEntries: [
          {
            date: '2026-03-20',
            provider: 'garmin',
            steps: 5000,
            sourceUpdatedAt: '2026-04-13T12:00:00.000Z',
            updatedAt: '2026-04-13T12:00:00.000Z',
          },
        ],
        nextHealthCursor: 'health-1',
        nextActivityCursor: 'activity-1',
      })
      .mockResolvedValueOnce({
        wellnessEntries: [],
      })

    const provider = {
      buildAuthorizationUrl: vi.fn(() => 'https://garmin.example/oauth/authorize'),
      exchangeCodeForTokens: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: 'access-token-2',
        refreshToken: 'refresh-token-2',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      fetchWellnessData,
    }

    const service = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    const session = await service.createConnectionSession('user-1')
    await service.completeConnectionFromCallback({ state: session.state, code: 'auth-code' })

    const firstSync = await service.syncConnection('user-1')
    expect(firstSync.window).toEqual({
      startDate: '2026-03-14',
      endDate: '2026-04-13',
      initialBackfill: true,
    })
    expect(firstSync.records).toHaveLength(1)
    expect(fetchWellnessData).toHaveBeenNthCalledWith(1, {
      accessToken: 'access-token',
      startDate: '2026-03-14',
      endDate: '2026-04-13',
      healthCursor: undefined,
      activityCursor: undefined,
    })

    const secondService = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-16T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    const secondSync = await secondService.syncConnection('user-1')
    expect(secondSync.window).toEqual({
      startDate: '2026-04-10',
      endDate: '2026-04-16',
      initialBackfill: false,
    })
    expect(fetchWellnessData).toHaveBeenNthCalledWith(2, {
      accessToken: 'access-token',
      startDate: '2026-04-10',
      endDate: '2026-04-16',
      healthCursor: 'health-1',
      activityCursor: 'activity-1',
    })
  })

  it('marks the connection rate limited or reconnect required when Garmin rejects the sync', async () => {
    const provider = {
      buildAuthorizationUrl: vi.fn(() => 'https://garmin.example/oauth/authorize'),
      exchangeCodeForTokens: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      fetchWellnessData: vi
        .fn()
        .mockResolvedValueOnce({
          wellnessEntries: [],
          rateLimitedUntil: '2026-04-13T18:00:00.000Z',
        })
        .mockRejectedValueOnce(new GarminProviderError('invalidToken', 'Garmin rejected the token.', 401)),
    }

    const service = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    const session = await service.createConnectionSession('user-1')
    await service.completeConnectionFromCallback({ state: session.state, code: 'auth-code' })

    await expect(service.syncConnection('user-1')).rejects.toMatchObject({
      code: 'garminRateLimited',
      status: 429,
    })

    const rateLimitedStatus = await service.getConnectionStatus('user-1')
    expect(rateLimitedStatus.connection.status).toBe('rate_limited')
    expect(rateLimitedStatus.connection.retryAfterAt).toBe('2026-04-13T18:00:00.000Z')

    const retryingService = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    await expect(retryingService.syncConnection('user-1')).rejects.toMatchObject({
      code: 'garminRateLimited',
      status: 429,
    })

    const reconnectProvider = {
      ...provider,
      fetchWellnessData: vi.fn(async () => {
        throw new GarminProviderError('invalidToken', 'Garmin rejected the token.', 401)
      }),
    }

    const reconnectService = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider: reconnectProvider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    await reconnectService.disconnectConnection('user-1')
    const refreshSession = await reconnectService.createConnectionSession('user-1')
    await reconnectService.completeConnectionFromCallback({
      state: refreshSession.state,
      code: 'auth-code',
    })

    await expect(reconnectService.syncConnection('user-1')).rejects.toMatchObject({
      code: 'garminReconnectRequired',
      status: 409,
    })
    const reconnectStatus = await reconnectService.getConnectionStatus('user-1')
    expect(reconnectStatus.connection.status).toBe('reconnect_required')
  })

  it('marks stale connections after 72 hours without a successful sync', async () => {
    const provider = {
      buildAuthorizationUrl: vi.fn(() => 'https://garmin.example/oauth/authorize'),
      exchangeCodeForTokens: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-04-20T13:00:00.000Z',
      })),
      fetchWellnessData: vi.fn(async () => ({
        wellnessEntries: [],
      })),
    }

    const service = createGarminService({
      store: createGarminStateStore({ stateDir: tempDir }),
      provider,
      tokenKeyRing: createTokenKeyRing(),
      now: () => new Date('2026-04-13T12:00:00.000Z'),
      redirectUri: 'https://app.example.com/api/garmin/callback',
      scope: 'read',
    })

    const session = await service.createConnectionSession('user-1')
    await service.completeConnectionFromCallback({ state: session.state, code: 'auth-code' })

    await service.saveConnection({
      ...(await service.getConnectionStatus('user-1')).connection,
      lastSuccessfulSyncAt: '2026-04-09T11:59:00.000Z',
    })

    const status = await service.getConnectionStatus('user-1')
    expect(status.staleData).toBe(true)
    expect(status.connection.staleData).toBe(true)
  })
})
