import { Component, ErrorInfo, ReactNode } from 'react'
import { logClientError } from '../lib/errorLog'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError({
      message: error.message,
      stack: info.componentStack ?? error.stack ?? null,
      source: 'react-error-boundary',
      url: window.location.href,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <p className="text-lg font-semibold text-red-700">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-600">
              This screen ran into an unexpected error. It has been logged — check Settings → Error log, or reload the page.
            </p>
            <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
