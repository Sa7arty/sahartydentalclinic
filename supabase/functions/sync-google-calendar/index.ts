import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://esm.sh/jose@5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const CLINIC_TIMEZONE = 'Africa/Cairo'

interface ServiceAccountKey {
  client_email: string
  private_key: string
}

// Exchanges the service account's key for a short-lived Calendar API access
// token via the standard OAuth2 JWT-bearer flow — no per-provider Google login
// needed, since the calendar is owned by the service account and shared with
// the provider's email via ACL instead.
async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  const privateKey = await jose.importPKCS8(key.private_key, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/calendar',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(key.client_email)
    .setSubject(key.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

async function gcal(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Google Calendar API error (${path}): ${JSON.stringify(data)}`)
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await caller.auth.getUser()
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const visitId = String(body.visit_id ?? '')
    if (!visitId || (action !== 'sync' && action !== 'delete')) return json({ error: 'Missing or invalid visit_id/action' }, 400)

    // Not configured yet — the owner hasn't set up Google Cloud credentials.
    // No-op rather than error, so the app keeps working normally without sync.
    const rawKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if (!rawKey) return json({ ok: true, synced: false, reason: 'not_configured' })
    const key: ServiceAccountKey = JSON.parse(rawKey)

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: visit, error: visitErr } = await admin
      .from('visits')
      .select(
        'id, scheduled_at, duration_minutes, status, notes, google_event_id, patient:patients(first_name, middle_name, last_name), provider:providers(id, email, google_calendar_sync_enabled, google_calendar_id)',
      )
      .eq('id', visitId)
      .maybeSingle()
    if (visitErr) return json({ error: visitErr.message }, 500)
    if (!visit) return json({ ok: true, synced: false, reason: 'visit_not_found' })

    const provider = visit.provider as unknown as {
      id: string
      email: string | null
      google_calendar_sync_enabled: boolean
      google_calendar_id: string | null
    } | null
    if (!provider || !provider.google_calendar_sync_enabled) return json({ ok: true, synced: false, reason: 'sync_disabled' })
    if (!provider.email) return json({ ok: true, synced: false, reason: 'provider_has_no_email' })

    const accessToken = await getAccessToken(key)

    // First appointment ever synced for this provider — create a dedicated
    // calendar owned by the service account and share it with the provider's
    // Google account so it shows up in their own Google Calendar.
    let calendarId = provider.google_calendar_id
    if (!calendarId) {
      const patientObj = visit.patient as unknown as { first_name: string; last_name: string } | null
      const calendar = await gcal(accessToken, '/calendars', {
        method: 'POST',
        body: JSON.stringify({ summary: 'Saharty Dental Clinic — Appointments', timeZone: CLINIC_TIMEZONE }),
      })
      calendarId = calendar.id as string
      await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/acl`, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', scope: { type: 'user', value: provider.email } }),
      })
      await admin.from('providers').update({ google_calendar_id: calendarId }).eq('id', provider.id)
      void patientObj
    }

    if (action === 'delete') {
      if (visit.google_event_id) {
        await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${visit.google_event_id}`, { method: 'DELETE' }).catch(
          () => {},
        )
      }
      return json({ ok: true, synced: true, deleted: true })
    }

    const patient = visit.patient as unknown as { first_name: string; middle_name: string | null; last_name: string } | null
    const patientName = patient ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ') : 'Unknown patient'
    const start = new Date(visit.scheduled_at)
    const end = new Date(start.getTime() + visit.duration_minutes * 60000)

    const eventBody = {
      summary: `${patientName} — Saharty Dental Clinic`,
      description: [`Patient: ${patientName}`, visit.notes ? `Notes: ${visit.notes}` : null, `Status: ${visit.status}`].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString(), timeZone: CLINIC_TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: CLINIC_TIMEZONE },
    }

    let eventId = visit.google_event_id
    if (eventId) {
      await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(eventBody),
      })
    } else {
      const created = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(eventBody),
      })
      eventId = created.id as string
      await admin.from('visits').update({ google_event_id: eventId }).eq('id', visit.id)
    }

    return json({ ok: true, synced: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
