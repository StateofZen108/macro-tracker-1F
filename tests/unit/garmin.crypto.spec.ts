import { describe, expect, it } from 'vitest'
import {
  decryptGarminSecret,
  decryptGarminTokenBundle,
  encryptGarminSecret,
  encryptGarminTokenBundle,
  readGarminTokenKeyRingFromEnv,
} from '../../server/garmin/crypto'

function makeBase64Key(seed: number): string {
  return Buffer.alloc(32, seed).toString('base64')
}

describe('garmin crypto', () => {
  it('encrypts and decrypts token bundles with the active key id', () => {
    const keyRing = readGarminTokenKeyRingFromEnv({
      GARMIN_TOKEN_KEY_CURRENT_ID: 'current',
      GARMIN_TOKEN_KEY_CURRENT: makeBase64Key(1),
    } as NodeJS.ProcessEnv)

    expect(keyRing).not.toBeNull()
    const bundle = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: '2026-04-13T12:30:00.000Z',
    }

    const encrypted = encryptGarminTokenBundle(bundle, keyRing!)
    expect(encrypted.accessToken.keyId).toBe('current')
    expect(encrypted.refreshToken.algorithm).toBe('aes-256-gcm')

    const decrypted = decryptGarminTokenBundle(encrypted, keyRing!)
    expect(decrypted).toEqual(bundle)
  })

  it('decrypts older envelopes with the previous key id after rotation', () => {
    const previousRing = readGarminTokenKeyRingFromEnv({
      GARMIN_TOKEN_KEY_CURRENT_ID: 'previous',
      GARMIN_TOKEN_KEY_CURRENT: makeBase64Key(2),
    } as NodeJS.ProcessEnv)
    const rotatedRing = readGarminTokenKeyRingFromEnv({
      GARMIN_TOKEN_KEY_CURRENT_ID: 'current',
      GARMIN_TOKEN_KEY_CURRENT: makeBase64Key(3),
      GARMIN_TOKEN_KEY_PREVIOUS_ID: 'previous',
      GARMIN_TOKEN_KEY_PREVIOUS: makeBase64Key(2),
    } as NodeJS.ProcessEnv)

    const envelope = encryptGarminSecret('sensitive-secret', previousRing!, '2026-04-13T13:00:00.000Z')
    expect(decryptGarminSecret(envelope, rotatedRing!)).toBe('sensitive-secret')
    expect(envelope.keyId).toBe('previous')
  })
})
