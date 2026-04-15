import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initializePwaRuntime } from './pwa/runtime'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { initializeStorage } from './utils/storage/schema'
import { initializeSyncPersistence } from './utils/sync/core'

async function bootstrapApplication(): Promise<void> {
  initializePwaRuntime()
  await Promise.allSettled([initializeSyncPersistence(), initializeDiagnosticsPersistence()])
  initializeStorage()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrapApplication()
