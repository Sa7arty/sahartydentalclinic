import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Visit,
  Patient,
  Location,
  Provider,
  patientFullName,
  providerFullName,
  telHref,
  whatsappHref,
  VisitStatus,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_COLORS,
  visitRowClass,
  visitChipClass,
  visitBlockClass,
} from '../types'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { toYmd, fromYmd, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, dayStart, dayEnd, toDatetimeLocal, WEEKDAY_NAMES_FROM } from '../lib/dates'
import { exportDaySchedulePdf } from '../lib/pdf'
import PatientBadges from '../components/PatientBadges'
import { syncVisitToGoogle, deleteVisitFromGoogle } from '../lib/googleCalendarSync'

type SchedulePatient = Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'phone' | 'date_of_birth' | 'is_smoker'> & {
  medical_history: string | null
  group: { name: string } | null
}
type VisitRow = Visit & { patient: SchedulePatient | null }

const NO_PROVIDER = ''
type View = 'day' | 'week' | 'month'

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 75, 90, 120]

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000)
}

// --- Hour-grid week view (Google-Calendar-style) --------------------------

const HOUR_HEIGHT = 56 // px per hour row
const GRID_HOURS = Array.from({ length: 24 }, (_, i) => i)
const BUSINESS_START_HOUR = 7
const BUSINESS_END_HOUR = 21

function hourLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

function minutesFromMidnight(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Greedy interval-graph column assignment so overlapping visits render side-by-side instead of stacking. */
function layoutDayOverlaps(visits: VisitRow[]): Map<string, { col: number; cols: number }> {
  const sorted = [...visits].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const result = new Map<string, { col: number; cols: number }>()
  let clusterVisits: VisitRow[] = []
  let clusterEnd = -1

  function flushCluster() {
    if (clusterVisits.length === 0) return
    const colEnds: number[] = []
    for (const v of clusterVisits) {
      const start = minutesFromMidnight(v.scheduled_at)
      const end = start + v.duration_minutes
      let col = colEnds.findIndex((e) => e <= start)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(end)
      } else {
        colEnds[col] = end
      }
      result.set(v.id, { col, cols: 0 })
    }
    for (const v of clusterVisits) result.set(v.id, { col: result.get(v.id)!.col, cols: colEnds.length })
    clusterVisits = []
  }

  for (const v of sorted) {
    const start = minutesFromMidnight(v.scheduled_at)
    if (clusterVisits.length > 0 && start >= clusterEnd) {
      flushCluster()
      clusterEnd = -1
    }
    clusterVisits.push(v)
    clusterEnd = Math.max(clusterEnd, start + v.duration_minutes)
  }
  flushCluster()
  return result
}

export default function Schedule() {
  const { locationIds, isDentist } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [locations, setLocations] = useState<Location[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [view, setView] = useState<View>('day')
  const [anchor, setAnchor] = useState(() => toYmd(new Date()))
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingVisit, setEditingVisit] = useState<VisitRow | null>(null)
  const [conditionIds, setConditionIds] = useState<Set<string>>(new Set())

  const weekStartDay = settings.week_start_day
  const weekdayNames = WEEKDAY_NAMES_FROM(weekStartDay)
  const today = toYmd(new Date())

  const rangeStart = view === 'day' ? anchor : view === 'week' ? startOfWeek(anchor, weekStartDay) : startOfMonth(anchor)
  const rangeEnd = view === 'day' ? anchor : view === 'week' ? addDays(startOfWeek(anchor, weekStartDay), 6) : endOfMonth(anchor)

  useEffect(() => {
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data ?? []))
    supabase.from('providers').select('*').eq('active', true).order('first_name').then(({ data }) => setProviders(data ?? []))
    supabase.from('patient_conditions').select('patient_id').then(({ data }) => setConditionIds(new Set((data ?? []).map((c: any) => c.patient_id))))
  }, [])

  useEffect(() => {
    load()
  }, [rangeStart, rangeEnd, locationFilter])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('visits')
      .select('*, patient:patients(id, first_name, middle_name, last_name, phone, date_of_birth, is_smoker, medical_history, group:patient_groups(name)), provider:providers(first_name,last_name)')
      .gte('scheduled_at', dayStart(rangeStart).toISOString())
      .lte('scheduled_at', dayEnd(rangeEnd).toISOString())
      .order('scheduled_at')

    if (locationFilter !== 'all') query = query.eq('location_id', locationFilter)

    const { data } = await query
    setVisits((data as unknown as VisitRow[]) ?? [])
    setLoading(false)
  }

  async function handleChangeDuration(visitId: string, minutes: number) {
    setVisits((cur) => cur.map((v) => (v.id === visitId ? { ...v, duration_minutes: minutes } : v)))
    const { error } = await supabase.from('visits').update({ duration_minutes: minutes }).eq('id', visitId)
    if (error) alert(error.message)
    else syncVisitToGoogle(visitId)
  }

  async function handleChangeStatus(visitId: string, status: VisitStatus) {
    setVisits((cur) => cur.map((v) => (v.id === visitId ? { ...v, status } : v)))
    const { error } = await supabase.from('visits').update({ status }).eq('id', visitId)
    if (error) alert(error.message)
    else syncVisitToGoogle(visitId)
  }

  async function handleChangeProvider(visitId: string, providerId: string) {
    setVisits((cur) => cur.map((v) => (v.id === visitId ? { ...v, provider_id: providerId || null } : v)))
    // Clear the synced event id when the provider changes — a synced event lives
    // on the OLD provider's Google Calendar, so it can't just be patched onto the
    // new provider; clearing it makes the next sync create a fresh event there.
    const { error } = await supabase.from('visits').update({ provider_id: providerId || null, google_event_id: null }).eq('id', visitId)
    if (error) alert(error.message)
    else syncVisitToGoogle(visitId)
  }

  async function handleSaveVisitEdit(patch: Record<string, unknown>) {
    if (!editingVisit) return
    if ('provider_id' in patch && patch.provider_id !== editingVisit.provider_id) patch.google_event_id = null
    const { error } = await supabase.from('visits').update(patch).eq('id', editingVisit.id)
    if (error) alert(error.message)
    else {
      const visitId = editingVisit.id
      setEditingVisit(null)
      load()
      syncVisitToGoogle(visitId)
    }
  }

  async function handleDeleteVisit(visitId: string) {
    if (!confirm('Delete this appointment? This cannot be undone.')) return
    deleteVisitFromGoogle(visitId)
    const { error } = await supabase.from('visits').delete().eq('id', visitId)
    if (error) alert(error.message)
    else {
      setEditingVisit(null)
      load()
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<string, VisitRow[]>()
    for (const v of visits) {
      const key = toYmd(new Date(v.scheduled_at))
      const list = map.get(key) ?? []
      list.push(v)
      map.set(key, list)
    }
    return map
  }, [visits])

  const visibleLocations = locations.filter((l) => isDentist || locationIds.includes(l.id))

  function goPrev() {
    if (view === 'day') setAnchor((a) => addDays(a, -1))
    else if (view === 'week') setAnchor((a) => addDays(a, -7))
    else setAnchor((a) => addMonths(a, -1))
  }
  function goNext() {
    if (view === 'day') setAnchor((a) => addDays(a, 1))
    else if (view === 'week') setAnchor((a) => addDays(a, 7))
    else setAnchor((a) => addMonths(a, 1))
  }
  function goToday() {
    setAnchor(today)
  }

  function jumpToDay(ymd: string) {
    setAnchor(ymd)
    setView('day')
  }

  function handleExportDay() {
    const list = (byDay.get(anchor) ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    exportDaySchedulePdf(
      fromYmd(anchor).toLocaleDateString(),
      list.map((v) => ({
        time: new Date(v.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        patientName: v.patient ? patientFullName(v.patient) : 'Unknown patient',
        status: v.status,
      })),
    )
  }

  const headerLabel = (() => {
    if (view === 'day') return fromYmd(anchor).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (view === 'week') {
      const start = fromYmd(rangeStart)
      const end = fromYmd(rangeEnd)
      const sameMonth = start.getMonth() === end.getMonth()
      const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const endLabel = sameMonth
        ? `${end.getDate()}, ${end.getFullYear()}`
        : end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      return `${startLabel} – ${endLabel}`
    }
    return fromYmd(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  })()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Schedule</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/schedule/new-visit')} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
            + Add visit
          </button>
          {view === 'day' && (
            <button onClick={handleExportDay} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Export day (PDF)
            </button>
          )}
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All locations</option>
            {visibleLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 text-sm">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 capitalize ${view === v ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-slate-50">
            ‹
          </button>
          <button onClick={goToday} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-slate-50">
            Today
          </button>
          <button onClick={goNext} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-slate-50">
            ›
          </button>
          <p className="ml-2 text-sm font-medium text-navy-900">{headerLabel}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : view === 'day' ? (
        <DayAgenda
          visits={byDay.get(anchor) ?? []}
          providers={providers}
          onChangeDuration={handleChangeDuration}
          onChangeStatus={handleChangeStatus}
          onChangeProvider={handleChangeProvider}
          onEdit={setEditingVisit}
          conditionIds={conditionIds}
          elderlyThreshold={settings.elderly_age_threshold}
        />
      ) : view === 'week' ? (
        <WeekView rangeStart={rangeStart} byDay={byDay} today={today} weekdayNames={weekdayNames} onSelectDay={jumpToDay} onEdit={setEditingVisit} conditionIds={conditionIds} elderlyThreshold={settings.elderly_age_threshold} />
      ) : (
        <MonthGrid anchor={anchor} byDay={byDay} today={today} weekStartDay={weekStartDay} weekdayNames={weekdayNames} onSelectDay={jumpToDay} onEdit={setEditingVisit} conditionIds={conditionIds} elderlyThreshold={settings.elderly_age_threshold} />
      )}

      {editingVisit && (
        <VisitEditorModal
          visit={editingVisit}
          providers={providers}
          conditionIds={conditionIds}
          elderlyThreshold={settings.elderly_age_threshold}
          onClose={() => setEditingVisit(null)}
          onSave={handleSaveVisitEdit}
          onDelete={() => handleDeleteVisit(editingVisit.id)}
          onOpenPatient={() => {
            const pid = editingVisit.patient?.id
            setEditingVisit(null)
            if (pid) navigate(`/patients/${pid}`)
          }}
        />
      )}
    </div>
  )
}

function VisitEditorModal({
  visit,
  providers,
  conditionIds,
  elderlyThreshold,
  onClose,
  onSave,
  onDelete,
  onOpenPatient,
}: {
  visit: VisitRow
  providers: Provider[]
  conditionIds: Set<string>
  elderlyThreshold: number
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => void
  onDelete: () => void
  onOpenPatient: () => void
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const when = form.get('scheduled_at') as string
    onSave({
      scheduled_at: when ? new Date(when).toISOString() : visit.scheduled_at,
      duration_minutes: Number(form.get('duration_minutes')),
      provider_id: form.get('provider_id') || null,
      status: form.get('status'),
      notes: form.get('notes') || null,
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-1.5 text-lg font-semibold text-navy-900">
            {visit.patient ? patientFullName(visit.patient) : 'Appointment'}
            {visit.patient && <PatientBadges patient={visit.patient} elderlyAgeThreshold={elderlyThreshold} hasCondition={conditionIds.has(visit.patient.id)} />}
          </h2>
          <button onClick={onOpenPatient} className="shrink-0 text-xs font-medium text-navy-700 hover:underline">
            Open patient file →
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Date &amp; time</label>
            <input name="scheduled_at" type="datetime-local" defaultValue={toDatetimeLocal(visit.scheduled_at)} required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Duration</label>
              <select name="duration_minutes" defaultValue={visit.duration_minutes} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {DURATION_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Status</label>
              <select name="status" defaultValue={visit.status} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(VISIT_STATUS_LABELS) as VisitStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {VISIT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Provider</label>
            <select name="provider_id" defaultValue={visit.provider_id ?? NO_PROVIDER} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value={NO_PROVIDER}>No provider</option>
              {providers.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {providerFullName(pr)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Notes</label>
            <textarea name="notes" defaultValue={visit.notes ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={onDelete} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Delete
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function VisitTimeRange({ v }: { v: VisitRow }) {
  const start = new Date(v.scheduled_at)
  const end = addMinutes(v.scheduled_at, v.duration_minutes)
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <>
      {fmt(start)}–{fmt(end)}
    </>
  )
}

function DayAgenda({
  visits,
  providers,
  onChangeDuration,
  onChangeStatus,
  onChangeProvider,
  onEdit,
  conditionIds,
  elderlyThreshold,
}: {
  visits: VisitRow[]
  providers: Provider[]
  onChangeDuration: (id: string, minutes: number) => void
  onChangeStatus: (id: string, status: VisitStatus) => void
  onChangeProvider: (id: string, providerId: string) => void
  onEdit: (v: VisitRow) => void
  conditionIds: Set<string>
  elderlyThreshold: number
}) {
  const sorted = [...visits].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  return (
    <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
      {sorted.length === 0 && <p className="p-4 text-sm text-slate-500">No visits scheduled for this day.</p>}
      {sorted.map((v) => {
        const tel = telHref(v.patient?.phone ?? null)
        const wa = whatsappHref(v.patient?.phone ?? null)
        return (
        <div key={v.id} className={`flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0 ${visitRowClass(v.status)}`}>
          <div className="w-28 shrink-0 text-sm font-medium text-navy-700">
            <VisitTimeRange v={v} />
          </div>
          <Link to={`/patients/${v.patient?.id}`} className="flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-medium text-navy-900">
              {v.patient ? patientFullName(v.patient) : 'Unknown patient'}
              {v.patient && <PatientBadges patient={v.patient} elderlyAgeThreshold={elderlyThreshold} hasCondition={conditionIds.has(v.patient.id)} />}
            </p>
            {v.notes && <p className="truncate text-xs text-slate-400">{v.notes}</p>}
          </Link>
          {tel && (
            <a href={tel} title="Call" className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-navy-700 hover:bg-slate-100">
              Call
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-navy-700 hover:bg-slate-100">
              WhatsApp
            </a>
          )}
          <button onClick={() => onEdit(v)} className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-navy-700 hover:bg-slate-100">
            Edit
          </button>
          <select
            value={v.provider_id ?? NO_PROVIDER}
            onChange={(e) => onChangeProvider(v.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            title="Provider for this appointment"
            className="hidden rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 sm:block"
          >
            <option value={NO_PROVIDER}>No provider</option>
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {providerFullName(pr)}
              </option>
            ))}
          </select>
          <select
            value={v.duration_minutes}
            onChange={(e) => onChangeDuration(v.id, Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"
          >
            {DURATION_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
          <select
            value={v.status}
            onChange={(e) => onChangeStatus(v.id, e.target.value as VisitStatus)}
            className={`shrink-0 rounded-full border-0 px-2 py-1 text-xs font-medium ${VISIT_STATUS_COLORS[v.status]}`}
          >
            {(Object.keys(VISIT_STATUS_LABELS) as VisitStatus[]).map((s) => (
              <option key={s} value={s}>
                {VISIT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        )
      })}
    </div>
  )
}

function WeekView({
  rangeStart,
  byDay,
  today,
  weekdayNames,
  onSelectDay,
  onEdit,
  conditionIds,
  elderlyThreshold,
}: {
  rangeStart: string
  byDay: Map<string, VisitRow[]>
  today: string
  weekdayNames: string[]
  onSelectDay: (ymd: string) => void
  onEdit: (v: VisitRow) => void
  conditionIds: Set<string>
  elderlyThreshold: number
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))
  const scrollRef = useRef<HTMLDivElement>(null)
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, (BUSINESS_START_HOUR - 1) * HOUR_HEIGHT) })
  }, [rangeStart])

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex border-b border-slate-200">
        <div className="w-12 shrink-0 sm:w-16" />
        {days.map((ymd, i) => {
          const isToday = ymd === today
          const d = fromYmd(ymd)
          return (
            <button
              key={ymd}
              onClick={() => onSelectDay(ymd)}
              className={`min-w-[110px] flex-1 border-l border-slate-100 py-2 text-center hover:bg-slate-50 ${isToday ? 'bg-gold-50' : ''}`}
            >
              <p className="text-xs text-slate-500">{weekdayNames[i]}</p>
              <p className={`text-sm font-semibold ${isToday ? 'text-gold-600' : 'text-navy-900'}`}>
                {d.getDate()}/{d.getMonth() + 1}
              </p>
            </button>
          )
        })}
      </div>
      <div ref={scrollRef} className="flex max-h-[70vh] overflow-auto">
        <div className="sticky left-0 z-10 w-12 shrink-0 bg-white sm:w-16">
          {GRID_HOURS.map((h) => (
            <div key={h} className="relative border-t border-slate-100" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-1 text-[10px] text-slate-400">{hourLabel(h)}</span>
            </div>
          ))}
        </div>
        {days.map((ymd) => {
          const list = byDay.get(ymd) ?? []
          const layout = layoutDayOverlaps(list)
          const isToday = ymd === today
          return (
            <div key={ymd} className="relative min-w-[110px] flex-1 border-l border-slate-100" style={{ height: HOUR_HEIGHT * 24 }}>
              {GRID_HOURS.map((h) => (
                <div
                  key={h}
                  className={`absolute inset-x-0 border-t border-slate-100 ${h < BUSINESS_START_HOUR || h >= BUSINESS_END_HOUR ? 'bg-slate-50' : ''}`}
                  style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                />
              ))}
              {isToday && (
                <div className="absolute inset-x-0 z-20 border-t-2 border-red-500" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                  <div className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                </div>
              )}
              {list.map((v) => {
                const { col, cols } = layout.get(v.id) ?? { col: 0, cols: 1 }
                const start = minutesFromMidnight(v.scheduled_at)
                const top = (start / 60) * HOUR_HEIGHT
                const height = Math.max((v.duration_minutes / 60) * HOUR_HEIGHT, 18)
                const widthPct = 100 / cols
                return (
                  <button
                    key={v.id}
                    onClick={() => onEdit(v)}
                    className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-tight text-white ${visitBlockClass(v.status)}`}
                    style={{ top, height, left: `calc(${col * widthPct}% + 1px)`, width: `calc(${widthPct}% - 2px)` }}
                  >
                    <p className="flex items-center gap-0.5 truncate font-semibold">
                      {v.patient ? patientFullName(v.patient) : 'Unknown'}
                      {height >= 56 && v.patient && (
                        <PatientBadges patient={v.patient} elderlyAgeThreshold={elderlyThreshold} hasCondition={conditionIds.has(v.patient.id)} size="xs" />
                      )}
                    </p>
                    {height >= 28 && (
                      <p className="truncate opacity-90">
                        <VisitTimeRange v={v} />
                      </p>
                    )}
                    {height >= 42 && v.provider && <p className="truncate opacity-90">{providerFullName(v.provider)}</p>}
                    {height >= 56 && v.patient?.phone && <p className="truncate opacity-90">{v.patient.phone}</p>}
                    {height >= 42 && <p className="truncate opacity-90">{VISIT_STATUS_LABELS[v.status]}</p>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthGrid({
  anchor,
  byDay,
  today,
  weekStartDay,
  weekdayNames,
  onSelectDay,
  onEdit,
  conditionIds,
  elderlyThreshold,
}: {
  anchor: string
  byDay: Map<string, VisitRow[]>
  today: string
  weekStartDay: number
  weekdayNames: string[]
  onSelectDay: (ymd: string) => void
  onEdit: (v: VisitRow) => void
  conditionIds: Set<string>
  elderlyThreshold: number
}) {
  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const gridStart = startOfWeek(monthStart, weekStartDay)
  const currentMonth = fromYmd(anchor).getMonth()

  const cells: string[] = []
  let cursor = gridStart
  while (cursor <= monthEnd || cells.length % 7 !== 0) {
    cells.push(cursor)
    cursor = addDays(cursor, 1)
    if (cells.length > 42) break
  }

  const MAX_NAMES = 3

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {weekdayNames.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd) => {
          const inMonth = fromYmd(ymd).getMonth() === currentMonth
          const list = (byDay.get(ymd) ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
          const isToday = ymd === today
          return (
            <div
              key={ymd}
              className={`flex min-h-[5.5rem] flex-col items-start rounded-lg p-1 text-left text-sm ${
                !inMonth ? 'text-slate-300' : isToday ? 'bg-gold-50' : 'hover:bg-slate-50'
              }`}
            >
              <button
                disabled={!inMonth}
                onClick={() => onSelectDay(ymd)}
                className={`px-1 ${isToday ? 'font-semibold text-gold-600' : inMonth ? 'text-navy-900' : ''}`}
              >
                {fromYmd(ymd).getDate()}
              </button>
              {inMonth && (
                <div className="mt-0.5 w-full space-y-0.5">
                  {list.slice(0, MAX_NAMES).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => onEdit(v)}
                      className={`flex w-full flex-wrap items-center gap-0.5 rounded px-1 py-0.5 text-left text-[10px] leading-tight ${visitChipClass(v.status)}`}
                    >
                      <span className="truncate">{v.patient ? patientFullName(v.patient) : 'Unknown'}</span>
                      {v.patient && <PatientBadges patient={v.patient} elderlyAgeThreshold={elderlyThreshold} hasCondition={conditionIds.has(v.patient.id)} size="xs" />}
                    </button>
                  ))}
                  {list.length > MAX_NAMES && (
                    <button onClick={() => onSelectDay(ymd)} className="px-1 text-[10px] text-slate-400 hover:underline">
                      +{list.length - MAX_NAMES} more
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
