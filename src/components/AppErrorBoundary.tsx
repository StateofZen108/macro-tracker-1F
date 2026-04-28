import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureClientException } from '../observability/sentry.client'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureClientException({
      error,
      componentStack: info.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-950">
          <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-red-700">App failed to render</p>
            <h1 className="mt-2 text-2xl font-semibold">Reload MacroTracker</h1>
            <p className="mt-2 text-sm text-stone-600">
              The error has been captured when production monitoring is configured.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

