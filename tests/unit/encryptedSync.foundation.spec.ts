import { describe, expect, it } from 'vitest'
import {
  enqueueEncryptedSyncEnvelope,
  loadEncryptedSyncQueue,
  markEncryptedSyncEnvelopeFailed,
  markEncryptedSyncEnvelopeReplicated,
} from '../../src/utils/storage/encryptedSync'

describe('encrypted sync foundation', () => {
  it('queues an encrypted envelope and allows failure and replication transitions', async () => {
    const queued = await enqueueEncryptedSyncEnvelope({
      recordKind: 'food_review_queue',
      recordId: 'review-1',
      updatedAt: '2026-04-16T09:00:00.000Z',
      payload: {
        status: 'pending',
        title: 'Chicken breast import',
      },
    })

    expect(queued.ok).toBe(true)
    expect(loadEncryptedSyncQueue()).toHaveLength(1)
    expect(loadEncryptedSyncQueue()[0]?.cipherTextBase64).toBeTruthy()

    const failed = markEncryptedSyncEnvelopeFailed(
      queued.ok ? queued.data.id : 'missing',
      'Replication offline.',
    )
    expect(failed.ok).toBe(true)
    expect(loadEncryptedSyncQueue()[0]?.status).toBe('failed')

    const replicated = markEncryptedSyncEnvelopeReplicated(queued.ok ? queued.data.id : 'missing')
    expect(replicated.ok).toBe(true)
    expect(loadEncryptedSyncQueue()[0]?.status).toBe('replicated')
  })
})
