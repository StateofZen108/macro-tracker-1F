import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { initializeStorage } from './utils/storage/schema'
import { initializeSyncPersistence } from './utils/sync/core'

registerSW({
  immediate: true,
})

async function bootstrapApplication(): Promise<void> {
  await Promise.allSettled([initializeSyncPersistence(), initializeDiagnosticsPersistence()])
  initializeStorage()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrapApplication()
