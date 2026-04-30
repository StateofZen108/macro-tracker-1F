const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-')

export const PAID_CUT_OS_PREVIEW_PRESET = 'paid-cut-os-preview'

export function createPreviewEnv(buildIdPrefix, extraFlags = {}) {
  return {
    ...process.env,
    MODE: 'production',
    VITE_APP_FEATURE_PRESET: PAID_CUT_OS_PREVIEW_PRESET,
    ...extraFlags,
    VITE_APP_BUILD_ID: process.env.VITE_APP_BUILD_ID ?? `${buildIdPrefix}-${timestamp()}`,
  }
}
