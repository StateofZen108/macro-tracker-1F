import type { ApiMiddlewareConfig } from './apiMiddleware.js'

const KB = 1024
const MB = 1024 * KB

const FOOD_RATE_LIMIT = {
  limit: 60,
  windowSeconds: 60,
  scope: 'ip',
  failClosedWithoutStore: true,
} as const

const SYNC_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
  scope: 'user',
  failClosedWithoutStore: false,
} as const

const GARMIN_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
  scope: 'user_or_ip',
  failClosedWithoutStore: false,
} as const

export const API_ROUTE_CONFIGS = {
  foodCatalogBarcode: {
    routeId: 'food_catalog.barcode',
    allowedMethods: ['GET'],
    timeoutMs: 3000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: FOOD_RATE_LIMIT,
  },
  foodCatalogSearch: {
    routeId: 'food_catalog.search',
    allowedMethods: ['GET'],
    timeoutMs: 3000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: FOOD_RATE_LIMIT,
  },
  labelOcrExtract: {
    routeId: 'label_ocr.extract',
    allowedMethods: ['POST'],
    timeoutMs: 15_000,
    bodyLimitBytes: 6 * MB,
    rateLimit: {
      limit: 10,
      windowSeconds: 60,
      scope: 'ip',
      failClosedWithoutStore: true,
    },
  },
  mealAiAnalyze: {
    routeId: 'meal_ai.analyze',
    allowedMethods: ['POST'],
    timeoutMs: 15_000,
    bodyLimitBytes: 6 * MB,
    rateLimit: {
      limit: 10,
      windowSeconds: 60,
      scope: 'ip',
      failClosedWithoutStore: true,
    },
  },
  billingWebhook: {
    routeId: 'billing.webhook',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 256 * KB,
  },
  supportBundle: {
    routeId: 'support.bundle',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 512 * KB,
    rateLimit: {
      limit: 10,
      windowSeconds: 60,
      scope: 'ip',
      failClosedWithoutStore: false,
    },
  },
  syncBootstrap: {
    routeId: 'sync.bootstrap',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 1 * MB,
    rateLimit: SYNC_RATE_LIMIT,
  },
  syncBootstrapStatus: {
    routeId: 'sync.bootstrap_status',
    allowedMethods: ['GET'],
    timeoutMs: 10_000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: SYNC_RATE_LIMIT,
  },
  syncPull: {
    routeId: 'sync.pull',
    allowedMethods: ['GET'],
    timeoutMs: 10_000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: SYNC_RATE_LIMIT,
  },
  syncPush: {
    routeId: 'sync.push',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 1 * MB,
    rateLimit: SYNC_RATE_LIMIT,
  },
  garminBackgroundSync: {
    routeId: 'garmin.background_sync',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 128 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
  garminCallback: {
    routeId: 'garmin.callback',
    allowedMethods: ['GET'],
    timeoutMs: 10_000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
  garminConnect: {
    routeId: 'garmin.connect',
    allowedMethods: ['GET'],
    timeoutMs: 10_000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
  garminDisconnect: {
    routeId: 'garmin.disconnect',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 128 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
  garminStatus: {
    routeId: 'garmin.status',
    allowedMethods: ['GET'],
    timeoutMs: 10_000,
    queryStringLimitBytes: 8 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
  garminSync: {
    routeId: 'garmin.sync',
    allowedMethods: ['POST'],
    timeoutMs: 10_000,
    bodyLimitBytes: 128 * KB,
    rateLimit: GARMIN_RATE_LIMIT,
  },
} satisfies Record<string, ApiMiddlewareConfig>
