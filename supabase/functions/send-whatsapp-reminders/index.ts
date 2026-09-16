import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CLINIC_TIMEZONE = 'Africa/Cairo'

// Same normalization AddVisitModal/Schedule/etc. use client-side for wa.me
// links (src/types.ts whatsappHref) — Egyptian local numbers (leading 0)
// become +20..., anything already looking international is left alone.
function normalizePhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '20' + digits.slice(1)
  return digits
}

function cairoDateString(d: Date): string {
  // en-CA formats as YYYY-MM-DD, which sorts/compares the same way it reads.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function cairoHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIMEZONE, hour: 'numeric', hour12: false }).format(d))
}

function cairoTimeString(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
}

interface ReminderSettings {
  enabled?: boolean
  send_hour?: number
  template_name?: string
  template_lang?: string
}

async function sendTemplate(phoneNumberId: string, accessToken: string, to: string, templateName: string, lang: string, params: string[]) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`WhatsApp send failed: ${JSON.stringify(data)}`)
  return data
}

// Runs unattended off a pg_cron schedule (every 30 min) with the anon key as
// its bearer token (just to satisfy verify_jwt — see schema.sql) — there's
// no signed-in user to check, unlike the other edge functions here. Each
// visit is only ever reminded once (reminder_sent_at), so running every 30
// min instead of pinning one exact UTC time is what lets the owner change
// the send hour in Settings without a new deploy — this function just
// checks "does the current Cairo hour match what's configured" on every run.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    if (!accessToken || !phoneNumberId) return json({ ok: true, sent: 0, reason: 'not_configured' })

    const { data: settingsRow } = await admin.from('app_settings').select('whatsapp_reminder_settings').eq('id', true).maybeSingle()
    const settings = (settingsRow?.whatsapp_reminder_settings as ReminderSettings) ?? {}
    if (!settings.enabled) return json({ ok: true, sent: 0, reason: 'disabled' })

    const now = new Date()
    if (cairoHour(now) !== (settings.send_hour ?? 18)) return json({ ok: true, sent: 0, reason: 'not_send_hour' })

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowStr = cairoDateString(tomorrow)
    const templateName = settings.template_name || 'appointment_reminder'
    const templateLang = settings.template_lang || 'en_US'

    // Cast a ~3-day net on scheduled_at (cheap, index-friendly) then filter to
    // tomorrow's exact Cairo calendar date in JS — avoids fragile UTC-offset
    // range math for a timezone that isn't UTC-aligned.
    const { data: visits, error } = await admin
      .from('visits')
      .select('id, scheduled_at, status, reminder_sent_at, patient:patients(first_name, middle_name, last_name, phone)')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString())
      .is('reminder_sent_at', null)
      .neq('status', 'cancelled')
    if (error) return json({ error: error.message }, 500)

    const due = (visits ?? []).filter((v: any) => cairoDateString(new Date(v.scheduled_at)) === tomorrowStr)

    let sent = 0
    const failures: string[] = []
    for (const v of due as any[]) {
      const patient = v.patient as { first_name: string; middle_name: string | null; last_name: string; phone: string | null } | null
      const phone = patient?.phone ? normalizePhone(patient.phone) : null
      if (!patient || !phone) continue
      const patientName = [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ')
      try {
        await sendTemplate(phoneNumberId, accessToken, phone, templateName, templateLang, [
          patientName,
          tomorrowStr,
          cairoTimeString(new Date(v.scheduled_at)),
        ])
        await admin.from('visits').update({ reminder_sent_at: new Date().toISOString() }).eq('id', v.id)
        sent++
      } catch (e) {
        failures.push(`${v.id}: ${String(e)}`)
      }
    }

    return json({ ok: true, sent, failed: failures.length, failures: failures.slice(0, 10) })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
