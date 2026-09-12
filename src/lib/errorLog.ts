import { supabase } from './supabase'

let installed = false

/**
 * Records a client-side error to the database so the owner can see it in
 * Settings → Error log without staff having to notice or report it. Must
 * never throw — logging a failure is not allowed to cause a second failure.
 */
export async function logClientError(payload: { message: string; stack?: string | null; source: string; url: string }) {
  try {
    await supabase.from('client_error_logs').insert({
      message: payload.message.slice(0, 2000),
      stack: payload.stack ? payload.stack.slice(0, 4000) : null,
      source: payload.source,
      url: payload.url,
      user_agent: navigator.userAgent,
    })
  } catch {
    // Swallow — e.g. the table doesn't exist yet, or the network is down.
  }
}

/** Catches errors React's own error boundary can't see: raw JS errors and rejected promises. */
export function installGlobalErrorLogging() {
  if (installed) return
  installed = true

  window.addEventListener('error', (e) => {
    logClientError({ message: e.message || 'Unknown error', stack: e.error?.stack ?? null, source: 'window.onerror', url: window.location.href })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const message = typeof reason === 'string' ? reason : reason?.message || 'Unhandled promise rejection'
    logClientError({ message, stack: reason?.stack ?? null, source: 'unhandledrejection', url: window.location.href })
  })
}
