import { supabase } from './supabase'

// Fire-and-forget best-effort Google Calendar sync. Never awaited by callers
// and never surfaces its own errors to the user — appointment scheduling must
// keep working exactly as before even if Google sync isn't configured yet or
// a call fails, since it's a convenience layered on top, not a dependency.
function invokeSync(action: 'sync' | 'delete', visitId: string) {
  supabase.functions.invoke('sync-google-calendar', { body: { action, visit_id: visitId } }).catch(() => {})
}

/** Call after a visit is created or updated (any field), once the write has succeeded. */
export function syncVisitToGoogle(visitId: string) {
  invokeSync('sync', visitId)
}

/** Call BEFORE deleting a visit row, while it can still be looked up server-side. */
export function deleteVisitFromGoogle(visitId: string) {
  invokeSync('delete', visitId)
}
