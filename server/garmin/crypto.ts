import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'

import type {
  GarminSecretEnvelope,
  GarminTokenBundle,
} from './types'

export interface GarminTokenKeyRing {
  current: {
    keyId: string
    key: Buffer
  }
  previous?: {
    keyId: string
    key: Buffer
  }
}

export class GarminCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GarminCryptoError'
  }
}

function decodeBase64Key(value: string, label: string): Buffer {
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) {
    throw new GarminCryptoError(`${label} must be a 32-byte base64-encoded key.`)
  }

  return key
}

export function readGarminTokenKeyRingFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GarminTokenKeyRing | null {
  const currentKeyId = env.GARMIN_TOKEN_KEY_CURRENT_ID?.trim()
  const currentKey = env.GARMIN_TOKEN_KEY_CURRENT?.trim()
  if (!currentKeyId || !currentKey) {
    return null
  }

  const previousKeyId = env.GARMIN_TOKEN_KEY_PREVIOUS_ID?.trim()
  const previousKey = env.GARMIN_TOKEN_KEY_PREVIOUS?.trim()

  return {
    current: {
      keyId: currentKeyId,
      key: decodeBase64Key(currentKey, 'GARMIN_TOKEN_KEY_CURRENT'),
    },
    previous:
      previousKeyId && previousKey
        ? {
            keyId: previousKeyId,
            key: decodeBase64Key(previousKey, 'GARMIN_TOKEN_KEY_PREVIOUS'),
          }
        : undefined,
  }
}

function getKeyForEnvelope(
  keyRing: GarminTokenKeyRing,
  keyId: string,
): Buffer | null {
  if (keyRing.current.keyId === keyId) {
    return keyRing.current.key
  }

  if (keyRing.previous?.keyId === keyId) {
    return keyRing.previous.key
  }

  return null
}

export function encryptGarminSecret(
  value: string,
  keyRing: GarminTokenKeyRing,
  expiresAt: string,
): GarminSecretEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyRing.current.key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64')
  const authTag = cipher.getAuthTag().toString('base64')

  return {
    keyId: keyRing.current.keyId,
    iv: iv.toString('base64'),
    authTag,
    ciphertext,
    expiresAt,
    algorithm: 'aes-256-gcm',
  }
}

export function decryptGarminSecret(
  envelope: GarminSecretEnvelope,
  keyRing: GarminTokenKeyRing,
): string {
  const key = getKeyForEnvelope(keyRing, envelope.keyId)
  if (!key) {
    throw new GarminCryptoError(`Unable to decrypt Garmin secret with key id ${envelope.keyId}.`)
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}

export function encryptGarminTokenBundle(
  bundle: GarminTokenBundle,
  keyRing: GarminTokenKeyRing,
): {
  accessToken: GarminSecretEnvelope
  refreshToken: GarminSecretEnvelope
} {
  return {
    accessToken: encryptGarminSecret(bundle.accessToken, keyRing, bundle.expiresAt),
    refreshToken: encryptGarminSecret(bundle.refreshToken, keyRing, bundle.expiresAt),
  }
}

export function decryptGarminTokenBundle(
  record: {
    accessToken?: GarminSecretEnvelope
    refreshToken?: GarminSecretEnvelope
  },
  keyRing: GarminTokenKeyRing,
): GarminTokenBundle | null {
  if (!record.accessToken || !record.refreshToken) {
    return null
  }

  return {
    accessToken: decryptGarminSecret(record.accessToken, keyRing),
    refreshToken: decryptGarminSecret(record.refreshToken, keyRing),
    expiresAt: record.accessToken.expiresAt,
  }
}

export function rotateGarminTokenBundle(
  bundle: GarminTokenBundle,
  keyRing: GarminTokenKeyRing,
): {
  accessToken: GarminSecretEnvelope
  refreshToken: GarminSecretEnvelope
} {
  return encryptGarminTokenBundle(bundle, keyRing)
}
