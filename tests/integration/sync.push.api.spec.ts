import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthenticatedSyncUser = vi.fn()
const pushUserMutations = vi.fn()

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

vi.mock('../../server/sync/store.js', () => ({
  pushUserMutations,
}))

function buildRequest(body: unknown, authorization = 'Bearer test-token') {
  return new Request('http://localhost/api/sync/push', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('sync push API route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects malformed push payloads before writing any sync records', async () => {
    requireAuthenticatedSyncUser.mockResolvedValue({
      userId: 'user-1',
      email: 'sync@example.com',
    })

    const routeModule = await import('../../api/sync/push')
    const response = await routeModule.default.fetch(
      buildRequest({
        deviceId: 'device-1',
        mutations: [{ scope: 'foods' }],
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalidSyncPushRequest',
      },
    })
    expect(pushUserMutations).not.toHaveBeenCalled()
  })

  it('passes validated mutations through to the sync store', async () => {
    requireAuthenticatedSyncUser.mockResolvedValue({
      userId: 'user-1',
      email: 'sync@example.com',
    })
    pushUserMutations.mockResolvedValue({
      applied: [
        {
          mutationId: 'mutation-1',
          scope: 'foods',
          recordId: 'food-1',
          serverVersion: 7,
        },
      ],
      deadLetters: [],
      highWatermark: 7,
    })

    const routeModule = await import('../../api/sync/push')
    const response = await routeModule.default.fetch(
      buildRequest({
        deviceId: 'device-1',
        mutations: [
          {
            mutationId: 'mutation-1',
            scope: 'foods',
            recordId: 'food-1',
            operation: 'upsert',
            payload: { id: 'food-1', name: 'Banana' },
            baseServerVersion: null,
            queuedAt: '2026-04-12T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(pushUserMutations).toHaveBeenCalledWith('user-1', 'device-1', [
      expect.objectContaining({
        mutationId: 'mutation-1',
        scope: 'foods',
        recordId: 'food-1',
        operation: 'upsert',
      }),
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      applied: [
        {
          mutationId: 'mutation-1',
          scope: 'foods',
          recordId: 'food-1',
          serverVersion: 7,
        },
      ],
      highWatermark: 7,
    })
  })

  it('returns structured auth failures from the sync auth boundary', async () => {
    requireAuthenticatedSyncUser.mockRejectedValue(
      new MockSyncAuthError(401, 'missingAuth', 'A bearer token is required for sync requests.'),
    )

    const routeModule = await import('../../api/sync/push')
    const response = await routeModule.default.fetch(
      buildRequest({
        deviceId: 'device-1',
        mutations: [],
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'missingAuth',
      },
    })
  })
})
