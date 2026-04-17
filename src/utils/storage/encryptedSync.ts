import type {
  ActionResult,
  EncryptedSyncEnvelope,
  EncryptedSyncRecordKind,
} from '../../types'

const STORAGE_KEYS = {
  queue: 'mt_encrypted_sync_queue',
  key: 'mt_encrypted_sync_key',
} as const

type Listener = () => void

const listeners = new Set<Listener>()
let cache: EncryptedSyncEnvelope[] | null = null

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function canUseStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined'
}

function canUseCrypto(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

function getStorage(): Storage | null {
  return canUseStorage() ? globalThis.localStorage : null
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function toBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is unavailable in this environment.')
  }

  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this environment.')
  }

  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function normalizeEnvelope(rawValue: unknown): EncryptedSyncEnvelope | null {
  if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
    return null
  }

  const raw = rawValue as Record<string, unknown>
  const status =
    raw.status === 'queued' || raw.status === 'replicated' || raw.status === 'failed'
      ? raw.status
      : null

  if (
    typeof raw.id !== 'string' ||
    typeof raw.recordKind !== 'string' ||
    typeof raw.recordId !== 'string' ||
    typeof raw.updatedAt !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    !status ||
    typeof raw.ivBase64 !== 'string' ||
    typeof raw.cipherTextBase64 !== 'string'
  ) {
    return null
  }

  return {
    id: raw.id,
    recordKind: raw.recordKind as EncryptedSyncRecordKind,
    recordId: raw.recordId,
    updatedAt: raw.updatedAt,
    createdAt: raw.createdAt,
    status,
    ivBase64: raw.ivBase64,
    cipherTextBase64: raw.cipherTextBase64,
    errorMessage: typeof raw.errorMessage === 'string' && raw.errorMessage.trim() ? raw.errorMessage : undefined,
  }
}

function ensureLoaded(): EncryptedSyncEnvelope[] {
  if (cache !== null) {
    return cache
  }

  if (!canUseStorage()) {
    cache = []
    return cache
  }

  const raw = getStorage()?.getItem(STORAGE_KEYS.queue)
  if (!raw) {
    cache = []
    return cache
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    cache = Array.isArray(parsed)
      ? parsed.map((entry) => normalizeEnvelope(entry)).filter((entry): entry is EncryptedSyncEnvelope => entry !== null)
      : []
  } catch {
    cache = []
  }

  return cache
}

function persist(envelopes: EncryptedSyncEnvelope[]): ActionResult<void> {
  try {
    cache = [...envelopes].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    getStorage()?.setItem(STORAGE_KEYS.queue, JSON.stringify(cache))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist encrypted sync state locally.')
  }
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  if (!canUseStorage() || !canUseCrypto()) {
    throw new Error('Encryption is unavailable in this environment.')
  }

  const existing = getStorage()?.getItem(STORAGE_KEYS.key)
  if (existing) {
    return crypto.subtle.importKey(
      'raw',
      fromBase64(existing) as unknown as BufferSource,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    )
  }

  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  getStorage()?.setItem(STORAGE_KEYS.key, toBase64(rawKey))
  return crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

function getOrCreateRawKey(): Uint8Array {
  const existing = getStorage()?.getItem(STORAGE_KEYS.key)
  if (existing) {
    return fromBase64(existing)
  }

  const fallbackCrypto =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto
      : null
  const rawKey = fallbackCrypto
    ? fallbackCrypto.getRandomValues(new Uint8Array(32))
    : Uint8Array.from({ length: 32 }, (_, index) => (index * 17 + 41) % 255)
  getStorage()?.setItem(STORAGE_KEYS.key, toBase64(rawKey))
  return rawKey
}

function xorEncrypt(payload: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  return payload.map((value, index) => value ^ key[index % key.length] ^ iv[index % iv.length])
}

export function subscribeToEncryptedSyncQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadEncryptedSyncQueue(): EncryptedSyncEnvelope[] {
  return ensureLoaded()
}

export function saveEncryptedSyncQueue(envelopes: EncryptedSyncEnvelope[]): ActionResult<void> {
  return persist(envelopes)
}

export async function enqueueEncryptedSyncEnvelope(input: {
  recordKind: EncryptedSyncRecordKind
  recordId: string
  updatedAt: string
  payload: unknown
}): Promise<ActionResult<EncryptedSyncEnvelope>> {
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(input.payload))
    const iv =
      typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
        ? crypto.getRandomValues(new Uint8Array(12))
        : Uint8Array.from({ length: 12 }, (_, index) => (index * 29 + 11) % 255)
    const cipherBytes = canUseCrypto() && canUseStorage()
      ? new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            await getOrCreateEncryptionKey(),
            encoded,
          ),
        )
      : xorEncrypt(encoded, getOrCreateRawKey(), iv)
    const now = new Date().toISOString()
    const envelope: EncryptedSyncEnvelope = {
      id: crypto.randomUUID(),
      recordKind: input.recordKind,
      recordId: input.recordId,
      updatedAt: input.updatedAt,
      createdAt: now,
      status: 'queued',
      ivBase64: toBase64(iv),
      cipherTextBase64: toBase64(cipherBytes),
    }

    const persistResult = persist([envelope, ...ensureLoaded()])
    return persistResult.ok ? ok(envelope) : persistResult
  } catch (error) {
    return fail(
      'encryptionFailed',
      error instanceof Error ? error.message : 'Unable to encrypt this sync envelope.',
    )
  }
}

export function markEncryptedSyncEnvelopeReplicated(envelopeId: string): ActionResult<EncryptedSyncEnvelope | null> {
  const existing = ensureLoaded().find((envelope) => envelope.id === envelopeId)
  if (!existing) {
    return ok(null)
  }

  const nextEnvelope: EncryptedSyncEnvelope = {
    ...existing,
    status: 'replicated',
    errorMessage: undefined,
  }

  const persistResult = persist(
    ensureLoaded().map((envelope) => (envelope.id === envelopeId ? nextEnvelope : envelope)),
  )
  return persistResult.ok ? ok(nextEnvelope) : persistResult
}

export function markEncryptedSyncEnvelopeFailed(
  envelopeId: string,
  errorMessage: string,
): ActionResult<EncryptedSyncEnvelope | null> {
  const existing = ensureLoaded().find((envelope) => envelope.id === envelopeId)
  if (!existing) {
    return ok(null)
  }

  const nextEnvelope: EncryptedSyncEnvelope = {
    ...existing,
    status: 'failed',
    errorMessage: errorMessage.trim() || undefined,
  }

  const persistResult = persist(
    ensureLoaded().map((envelope) => (envelope.id === envelopeId ? nextEnvelope : envelope)),
  )
  return persistResult.ok ? ok(nextEnvelope) : persistResult
}

export function clearEncryptedSyncStateForTests(): void {
  cache = []
  if (canUseStorage()) {
    getStorage()?.removeItem(STORAGE_KEYS.queue)
    getStorage()?.removeItem(STORAGE_KEYS.key)
  }
  emitChange()
}
