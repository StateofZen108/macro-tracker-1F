export type GarminConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'syncing'
  | 'rate_limited'
  | 'error'
  | 'reconnect_required'

export type GarminSyncActor = 'manual' | 'background'
export type GarminAutomationMode = 'server_background'

export interface GarminSecretEnvelope {
  keyId: string
  iv: string
  authTag: string
  ciphertext: string
  expiresAt: string
  algorithm: 'aes-256-gcm'
}

export interface GarminTokenBundle {
  accessToken: string
  refreshToken: string
  expiresAt: string
  tokenType?: string
  scope?: string
}

export interface GarminAuthSession {
  state: string
  userId: string
  codeVerifier: string
  redirectUri: string
  returnToUrl?: string
  createdAt: string
  expiresAt: string
}

export interface GarminWatermarks {
  health?: string
  activity?: string
}

export interface GarminConnectionRecord {
  userId: string
  status: GarminConnectionStatus
  createdAt: string
  updatedAt: string
  connectedAt?: string
  lastSuccessfulSyncAt?: string
  retryAfterAt?: string
  failureCount: number
  lastWatermarks: GarminWatermarks
  accessToken?: GarminSecretEnvelope
  refreshToken?: GarminSecretEnvelope
  tokenExpiresAt?: string
  pendingState?: string
  staleData: boolean
  lastSyncWindow?: {
    startDate: string
    endDate: string
  }
  lastErrorMessage?: string
  syncLeaseId?: string
  syncLeaseExpiresAt?: string
  lastSyncActor?: GarminSyncActor
}

export interface GarminWellnessEntry {
  date: string
  provider: 'garmin'
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  stressScore?: number
  bodyBatteryMax?: number
  intensityMinutes?: number
  derivedCardioMinutes?: number
  sourceUpdatedAt: string
  updatedAt: string
  deletedAt?: string
}

export interface GarminSyncResult {
  records: GarminWellnessEntry[]
  connection: GarminConnectionRecord
  window: {
    startDate: string
    endDate: string
    initialBackfill: boolean
  }
}

export interface GarminStatusResponse {
  connection: GarminConnectionRecord
  staleData: boolean
  lastSyncWindow?: GarminConnectionRecord['lastSyncWindow']
  providerConfigured: boolean
  persistentStoreConfigured: boolean
  backgroundAutomationEnabled: boolean
  automationMode?: GarminAutomationMode
}

export interface GarminBackgroundSyncResponse {
  startedAt: string
  finishedAt: string
  scannedUsers: number
  syncedUsers: number
  skippedUsers: number
  failedUsers: number
}

export interface GarminProviderAuthorizationInput {
  userId: string
  state: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  redirectUri: string
  scope: string
}

export interface GarminProviderTokenExchangeInput {
  code: string
  codeVerifier: string
  redirectUri: string
}

export interface GarminProviderRefreshInput {
  refreshToken: string
}

export interface GarminProviderSyncInput {
  accessToken: string
  startDate: string
  endDate: string
  healthCursor?: string
  activityCursor?: string
}

export interface GarminProviderSyncResponse {
  wellnessEntries: GarminWellnessEntry[]
  nextHealthCursor?: string
  nextActivityCursor?: string
  rateLimitedUntil?: string
}

export interface GarminTokenStore {
  currentKeyId: string
  currentKey: string
  previousKeyId?: string
  previousKey?: string
}

export interface GarminProviderAdapter {
  buildAuthorizationUrl(input: GarminProviderAuthorizationInput): string
  exchangeCodeForTokens(input: GarminProviderTokenExchangeInput): Promise<GarminTokenBundle>
  refreshAccessToken(input: GarminProviderRefreshInput): Promise<GarminTokenBundle>
  fetchWellnessData(input: GarminProviderSyncInput): Promise<GarminProviderSyncResponse>
}
