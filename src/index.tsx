import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { FEATURE_FLAG_PRESET, FEATURE_FLAGS } from './config/featureFlags'
import './index.css'
import { initializeClientObservability } from './observability/sentry.client'
import { initializePwaRuntime } from './pwa/runtime'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { initializeStorage } from './utils/storage/schema'
import { initializeSyncPersistence } from './utils/sync/core'

declare global {
  interface Window {
    __MT_FEATURE_FLAGS__?: {
      buildId: string
      preset: string | null
      flags: typeof FEATURE_FLAGS
    }
  }
}

async function bootstrapApplication(): Promise<void> {
  initializeClientObservability()
  initializePwaRuntime()
  await Promise.allSettled([initializeSyncPersistence(), initializeDiagnosticsPersistence()])
  initializeStorage()
  window.__MT_FEATURE_FLAGS__ = {
    buildId: import.meta.env.VITE_APP_BUILD_ID ?? 'local',
    preset: FEATURE_FLAG_PRESET,
    flags: FEATURE_FLAGS,
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void bootstrapApplication()
