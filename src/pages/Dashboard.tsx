import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import {
  Visit,
  Patient,
  Location,
  Provider,
  Employee,
  EmployeeAttendance,
  employeeFullName,
  patientFullName,
  providerFullName,
  telHref,
  whatsappHref,
  visitRowClass,
  visitTextClass,
  distanceMeters,
  attendanceHours,
} from '../types'
import { exportDailyHuddleSheetPdf } from '../lib/pdf'
import { toYmd, fromYmd, startOfWeek, dayStart, dayEnd } from '../lib/dates'

type VisitRow = Visit & {
  patient: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'phone' | 'file_number' | 'is_smoker'> | null
  location: Pick<Location, 'name'> | null
  provider: Pick<Provider, 'first_name' | 'last_name'> | null
}
type BalanceRow = { patient_id: string; full_name: string; balance: number }
type Stats = { visits: number; revenue: number; expenses: number; netProfit: number; newPatients: number; discounts: number }

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
const emptyStats: Stats = { visits: 0, revenue: 0, expenses: 0, netProfit: 0, newPatients: 0, discounts: 0 }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Supabase caps a single request at 1000 rows. To roll up the whole ledger for
// outstanding balances we page through it in 1000-row batches. `buildQuery` must
// return a FRESH query each call (a builder can't be reused after awaiting).
async function fetchAllRows<T>(buildQuery: () => any): Promise<T[]> {
  const step = 1000
  const all: T[] = []
  for (let from = 0; ; from += step) {
    const { data, error } = await buildQuery().range(from, from + step - 1)
    if (error) {
      console.error(error)
      break
    }
    const chunk = (data as T[]) ?? []
    all.push(...chunk)
    if (chunk.length < step) break
  }
  return all
}

function nowTimeString() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : ''
}

/** Wraps the browser's geolocation callback API in a promise. */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocation-unsupported'))
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  })
}

/** Sign In / Sign Out clock widget — only shows for the logged-in user's own linked employee record. */
function ClockWidget() {
  const { session } = useAuth()
  const { settings } = useSettings()
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined) // undefined = still loading
  const [todayRow, setTodayRow] = useState<EmployeeAttendance | null>(null)
  const [working, setWorking] = useState<'in' | 'out' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function load() {
    const { data: emp } = await supabase.from('employees').select('*').eq('user_id', session!.user.id).maybeSingle()
    setEmployee((emp as Employee) ?? null)
    if (emp) {
      const { data: row } = await supabase
        .from('employee_attendance')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('work_date', toYmd(new Date()))
        .maybeSingle()
      setTodayRow((row as EmployeeAttendance) ?? null)
    }
  }

  async function verifyAtClinic(): Promise<boolean> {
    setError(null)
    if (settings.clinic_latitude == null || settings.clinic_longitude == null) {
      setError("The clinic's location hasn't been set up yet — ask the owner to set it in Settings → Attendance.")
      return false
    }
    let pos: GeolocationPosition
    try {
      pos = await getPosition()
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code
      if (code === 1) setError('Location access was denied. Please allow location access for this site in your browser settings and try again.')
      else if (code === 3) setError('Getting your location timed out. Please try again.')
      else if ((e as Error)?.message === 'geolocation-unsupported') setError("Your browser doesn't support location, so we can't verify you're at the clinic.")
      else setError("Couldn't get your location. Please try again.")
      return false
    }
    const dist = distanceMeters(pos.coords.latitude, pos.coords.longitude, settings.clinic_latitude, settings.clinic_longitude)
    if (dist > settings.attendance_radius_meters) {
      setError(`You're about ${Math.round(dist)}m from the clinic — you need to be within ${settings.attendance_radius_meters}m to sign in/out.`)
      return false
    }
    return true
  }

  // Both buttons are always independently usable — someone who forgot to sign
  // in that morning still needs to be able to sign out at the end of the day,
  // not be blocked because there's no check-in on record yet.
  async function handleSignIn() {
    if (!employee || todayRow?.check_in) return
    setWorking('in')
    const ok = await verifyAtClinic()
    if (!ok) {
      setWorking(null)
      return
    }
    const row = {
      employee_id: employee.id,
      work_date: toYmd(new Date()),
      check_in: nowTimeString(),
      created_by: session?.user.id,
    }
    const { data, error: dbErr } = await supabase.from('employee_attendance').upsert(row, { onConflict: 'employee_id,work_date' }).select().single()
    setWorking(null)
    if (dbErr) return setError(dbErr.message)
    setTodayRow(data as EmployeeAttendance)
  }

  async function handleSignOut() {
    if (!employee || todayRow?.check_out) return
    setWorking('out')
    const ok = await verifyAtClinic()
    if (!ok) {
      setWorking(null)
      return
    }
    // Upsert (not update) so signing out works even with no check-in on record
    // yet — this only ever touches check_out, so an existing check_in is untouched.
    const row = {
      employee_id: employee.id,
      work_date: toYmd(new Date()),
      check_out: nowTimeString(),
      created_by: session?.user.id,
    }
    const { data, error: dbErr } = await supabase.from('employee_attendance').upsert(row, { onConflict: 'employee_id,work_date' }).select().single()
    setWorking(null)
    if (dbErr) return setError(dbErr.message)
    setTodayRow(data as EmployeeAttendance)
  }

  if (!employee) return null // dentist / anyone without a linked employee record: nothing to clock

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-navy-900">Attendance</p>
          <p className="text-xs text-slate-500">
            {todayRow?.check_in ? `Signed in at ${fmtTime(todayRow.check_in)}` : 'Not signed in yet'}
            {' · '}
            {todayRow?.check_out ? `Signed out at ${fmtTime(todayRow.check_out)}` : 'Not signed out yet'}
            {todayRow?.check_in && todayRow?.check_out && ` · ${attendanceHours(todayRow).toFixed(1)}h today`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSignIn}
            disabled={working !== null || !!todayRow?.check_in}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {todayRow?.check_in ? `✓ In ${fmtTime(todayRow.check_in)}` : working === 'in' ? 'Checking location…' : '📍 Sign In'}
          </button>
          <button
            onClick={handleSignOut}
            disabled={working !== null || !!todayRow?.check_out}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {todayRow?.check_out ? `✓ Out ${fmtTime(todayRow.check_out)}` : working === 'out' ? 'Checking location…' : '📍 Sign Out'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

/** Owner-only "who's in the clinic" roster — every active staff member's
 * today's clock-in/out at a glance, sorted so whoever is here right now
 * shows first. Reuses the same green-in / red-out language as the widget
 * above, but for everyone at once instead of just the signed-in person. */
function StaffAttendanceOverview() {
  const { isDentist } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<EmployeeAttendance[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (isDentist) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDentist])

  async function load() {
    const [{ data: emps }, { data: att }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('first_name'),
      supabase.from('employee_attendance').select('*').eq('work_date', toYmd(new Date())),
    ])
    setEmployees((emps as Employee[]) ?? [])
    setRows((att as EmployeeAttendance[]) ?? [])
    setLoaded(true)
  }

  if (!isDentist || !loaded) return null

  const byEmployee = new Map(rows.map((r) => [r.employee_id, r]))
  const status = (e: Employee) => {
    const r = byEmployee.get(e.id)
    if (r?.check_in && !r.check_out) return 'present' as const
    if (r?.check_in && r.check_out) return 'done' as const
    return 'absent' as const
  }
  const order = { present: 0, done: 1, absent: 2 }
  const sorted = [...employees].sort((a, b) => order[status(a)] - order[status(b)] || a.first_name.localeCompare(b.first_name))
  const presentCount = employees.filter((e) => status(e) === 'present').length
  const doneCount = employees.filter((e) => status(e) === 'done').length
  const absentCount = employees.length - presentCount - doneCount

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy-900">Who's in the clinic</p>
        <p className="text-xs text-slate-500">
          <span className="font-medium text-green-700">{presentCount} present</span>
          {' · '}
          <span className="font-medium text-red-600">{doneCount} signed out</span>
          {' · '}
          <span className="text-slate-400">{absentCount} not in yet</span>
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {sorted.length === 0 && <p className="py-2 text-sm text-slate-500">No active staff yet.</p>}
        {sorted.map((e) => {
          const r = byEmployee.get(e.id)
          const s = status(e)
          return (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2">
              <p className="text-sm text-navy-900">{employeeFullName(e)}</p>
              {s === 'present' && (
                <p className="text-sm font-medium text-green-700">● Signed in at {fmtTime(r!.check_in)}</p>
              )}
              {s === 'done' && (
                <p className="text-sm font-medium text-red-600">
                  Signed in at {fmtTime(r!.check_in)}, signed out at {fmtTime(r!.check_out)}
                </p>
              )}
              {s === 'absent' && <p className="text-sm text-slate-400">Not signed in yet</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { settings } = useSettings()
  const [todaysVisits, setTodaysVisits] = useState<VisitRow[]>([])
  const [tomorrowsVisits, setTomorrowsVisits] = useState<VisitRow[]>([])
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [balanceByPatient, setBalanceByPatient] = useState<Record<string, number>>({})
  const [todayStats, setTodayStats] = useState<Stats>(emptyStats)
  const [yesterdayStats, setYesterdayStats] = useState<Stats>(emptyStats)
  const [weekStats, setWeekStats] = useState<Stats>(emptyStats)
  const [lastWeekStats, setLastWeekStats] = useState<Stats>(emptyStats)
  const [monthStats, setMonthStats] = useState<Stats>(emptyStats)
  const [lastMonthStats, setLastMonthStats] = useState<Stats>(emptyStats)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const monthLabel = `${MONTH_NAMES[now.getMonth()]}/${now.getFullYear()}`
  const money = (n: number) => `${settings.currency} ${n.toFixed(0)}`
  const totalOutstanding = balances.reduce((s, b) => s + b.balance, 0)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.week_start_day])

  async function load() {
    setLoading(true)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    const weekStart = fromYmd(startOfWeek(toYmd(now), settings.week_start_day))
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(weekStart)
    lastWeekEnd.setMilliseconds(-1)

    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const [{ data: todays }, { data: tomorrows }, ledgerRows, todayData, yesterdayData, weekData, lastWeekData, monthData, lastMonthData] = await Promise.all([
      supabase
        .from('visits')
        .select('*, patient:patients(id, first_name, middle_name, last_name, phone, file_number, is_smoker), location:locations(name), provider:providers(first_name,last_name)')
        .gte('scheduled_at', dayStart(toYmd(now)).toISOString())
        .lte('scheduled_at', dayEnd(toYmd(now)).toISOString())
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('visits')
        .select('*, patient:patients(id, first_name, middle_name, last_name, phone, file_number, is_smoker), location:locations(name), provider:providers(first_name,last_name)')
        .gte('scheduled_at', dayStart(toYmd(tomorrow)).toISOString())
        .lte('scheduled_at', dayEnd(toYmd(tomorrow)).toISOString())
        .order('scheduled_at', { ascending: true }),
      fetchAllRows<any>(() => supabase.from('ledger_entries').select('patient_id, entry_type, amount, patients(title, first_name, middle_name, last_name)').order('id', { ascending: true })),
      loadStats(dayStart(toYmd(now)), dayEnd(toYmd(now))),
      loadStats(dayStart(toYmd(yesterday)), dayEnd(toYmd(yesterday))),
      loadStats(weekStart, now),
      loadStats(lastWeekStart, lastWeekEnd),
      loadStats(startOfMonth(now), endOfMonth(now)),
      loadStats(startOfMonth(lastMonth), endOfMonth(lastMonth)),
    ])

    setTodaysVisits((todays as unknown as VisitRow[]) ?? [])
    setTomorrowsVisits((tomorrows as unknown as VisitRow[]) ?? [])
    setTodayStats(todayData)
    setYesterdayStats(yesterdayData)
    setWeekStats(weekData)
    setLastWeekStats(lastWeekData)
    setMonthStats(monthData)
    setLastMonthStats(lastMonthData)

    const byPatient = new Map<string, BalanceRow>()
    for (const row of ledgerRows ?? []) {
      const key = row.patient_id
      const existing = byPatient.get(key) ?? {
        patient_id: key,
        full_name: row.patients ? patientFullName(row.patients) : 'Unknown',
        balance: 0,
      }
      existing.balance += row.entry_type === 'charge' ? Number(row.amount) : -Number(row.amount)
      byPatient.set(key, existing)
    }
    setBalances(Array.from(byPatient.values()).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance))
    setBalanceByPatient(Object.fromEntries(Array.from(byPatient.entries()).map(([pid, b]) => [pid, b.balance])))

    setLoading(false)
  }

  // Pulls allergies/conditions for today's patients on demand (only needed when printing the huddle sheet).
  async function handlePrintHuddleSheet() {
    const patientIds = Array.from(new Set(todaysVisits.map((v) => v.patient?.id).filter((x): x is string => !!x)))
    const [{ data: alg }, { data: cond }] = await Promise.all([
      patientIds.length ? supabase.from('patient_allergies').select('patient_id, name').in('patient_id', patientIds) : Promise.resolve({ data: [] as any[] }),
      patientIds.length ? supabase.from('patient_conditions').select('patient_id, condition').in('patient_id', patientIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const alertsByPatient = new Map<string, string[]>()
    for (const a of alg ?? []) alertsByPatient.set(a.patient_id, [...(alertsByPatient.get(a.patient_id) ?? []), a.name])
    for (const c of cond ?? []) alertsByPatient.set(c.patient_id, [...(alertsByPatient.get(c.patient_id) ?? []), c.condition])

    const rows = todaysVisits
      .slice()
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .map((v) => {
        const pid = v.patient?.id
        const alerts = [...(pid ? alertsByPatient.get(pid) ?? [] : []), v.patient?.is_smoker ? 'Smoker' : null].filter(Boolean) as string[]
        return {
          time: new Date(v.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          patientName: v.patient ? patientFullName(v.patient) : 'Unknown patient',
          fileNumber: v.patient?.file_number ?? null,
          provider: v.provider ? providerFullName(v.provider) : 'No provider',
          status: v.status,
          balance: pid ? balanceByPatient[pid] ?? 0 : 0,
          alerts: alerts.join(', '),
        }
      })
    exportDailyHuddleSheetPdf(toYmd(now).split('-').reverse().join('/'), settings.currency, rows)
  }

  async function loadStats(from: Date, to: Date): Promise<Stats> {
    const [{ count: visits }, payments, expenseRows, { count: newPatients }, discountRows] = await Promise.all([
      supabase.from('visits').select('id', { count: 'exact', head: true }).gte('scheduled_at', from.toISOString()).lte('scheduled_at', to.toISOString()),
      fetchAllRows<any>(() => supabase.from('ledger_entries').select('amount').eq('entry_type', 'payment').gte('occurred_at', from.toISOString()).lte('occurred_at', to.toISOString())),
      fetchAllRows<any>(() => supabase.from('expenses').select('amount').gte('expense_date', toYmd(from)).lte('expense_date', toYmd(to))),
      supabase.from('patients').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
      fetchAllRows<any>(() => supabase.from('ledger_entries').select('amount').eq('entry_type', 'discount').gte('occurred_at', from.toISOString()).lte('occurred_at', to.toISOString())),
    ])
    const revenue = (payments ?? []).reduce((sum, p: any) => sum + Number(p.amount), 0)
    const expenseTotal = (expenseRows ?? []).reduce((sum, e: any) => sum + Number(e.amount), 0)
    const discounts = (discountRows ?? []).reduce((sum, d: any) => sum + Number(d.amount), 0)
    return { visits: visits ?? 0, revenue, expenses: expenseTotal, netProfit: revenue - expenseTotal, newPatients: newPatients ?? 0, discounts }
  }

  if (loading) return <p className="text-navy-700">Loading dashboard…</p>

  const appointmentSection = (title: string, list: VisitRow[], onPrint?: () => void) => (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-navy-800">{title}</h2>
        {onPrint && (
          <button onClick={onPrint} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-slate-50">
            🖨️ Print huddle sheet
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing scheduled.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list.map((v) => {
            const tel = telHref(v.patient?.phone ?? null)
            const wa = whatsappHref(v.patient?.phone ?? null)
            return (
              <div key={v.id} className={`flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0 ${visitRowClass(v.status)}`}>
                <Link to={`/patients/${v.patient?.id}`} className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${visitTextClass(v.status)}`}>{v.patient ? patientFullName(v.patient) : 'Unknown patient'}</p>
                  <p className="truncate text-xs text-slate-500">{v.provider ? providerFullName(v.provider) : 'No provider'}</p>
                </Link>
                {(tel || wa) && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {tel && (
                      <a href={tel} title="Call" className="rounded-md border border-slate-200 px-2 py-0.5 text-center text-xs text-navy-700 hover:bg-slate-100">
                        Call
                      </a>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-md border border-slate-200 px-2 py-0.5 text-center text-xs text-navy-700 hover:bg-slate-100">
                        WhatsApp
                      </a>
                    )}
                  </div>
                )}
                <div className="shrink-0 text-right">
                  <p className="text-sm text-navy-700">
                    {new Date(v.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="text-xs text-slate-400"> ({v.duration_minutes}min)</span>
                  </p>
                  <p className={`text-xs font-medium capitalize ${v.status === 'confirmed' ? 'text-slate-500' : visitTextClass(v.status)}`}>{v.status}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  const trend = (current: number, previous: number, goodWhenUp = true) => {
    const diff = current - previous
    if (Math.abs(diff) < 0.0001 || previous === 0) return null
    const up = diff > 0
    const good = up === goodWhenUp
    const pct = Math.round((diff / Math.abs(previous)) * 100)
    return (
      <span className={`text-[11px] font-medium ${good ? 'text-green-600' : 'text-red-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
    )
  }

  const statTiles = (stats: Stats, compare?: Stats) => {
    const tiles = [
      { label: 'Visits', value: String(stats.visits), cur: stats.visits, prev: compare?.visits, good: true, cls: 'text-navy-900' },
      { label: 'Revenue', value: money(stats.revenue), cur: stats.revenue, prev: compare?.revenue, good: true, cls: 'text-green-600' },
      { label: 'Expenses', value: money(stats.expenses), cur: stats.expenses, prev: compare?.expenses, good: false, cls: 'text-red-600' },
      { label: 'Net profit', value: money(stats.netProfit), cur: stats.netProfit, prev: compare?.netProfit, good: true, cls: stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600' },
      { label: 'Discounts given', value: money(stats.discounts), cur: stats.discounts, prev: compare?.discounts, good: false, cls: 'text-amber-600' },
      { label: 'New patients', value: String(stats.newPatients), cur: stats.newPatients, prev: compare?.newPatients, good: true, cls: 'text-navy-900' },
    ]
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t.label}</p>
            <div className="flex items-baseline justify-between gap-1">
              <p className={`text-xl font-semibold ${t.cls}`}>{t.value}</p>
              {compare && t.prev !== undefined && trend(t.cur, t.prev, t.good)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-navy-900">Dashboard</h1>

      <ClockWidget />
      <StaffAttendanceOverview />

      {/* Quick glance */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Today's appointments</p>
            <p className="text-2xl font-semibold text-navy-900">{todaysVisits.length}</p>
          </div>
          <Link to="/finances" className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
            <p className="text-xs text-slate-500">Total outstanding</p>
            <p className="text-2xl font-semibold text-gold-600">{money(totalOutstanding)}</p>
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {appointmentSection("Today's appointments", todaysVisits, handlePrintHuddleSheet)}
        {appointmentSection("Tomorrow's appointments", tomorrowsVisits)}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Today — {toYmd(now).split('-').reverse().join('/')} (vs yesterday)</h2>
        {statTiles(todayStats, yesterdayStats)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">This week (since {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][settings.week_start_day]}) — vs last week</h2>
        {statTiles(weekStats, lastWeekStats)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">This month — {monthLabel} (vs last month)</h2>
        {statTiles(monthStats, lastMonthStats)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Outstanding balances</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-slate-500">No patients currently owe a balance.</p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {balances.map((b) => (
              <Link
                key={b.patient_id}
                to={`/patients/${b.patient_id}`}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <p className="font-medium text-navy-900">
                  {b.full_name}
                  {b.balance >= settings.big_debt_threshold && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">owes a lot</span>}
                </p>
                <p className="font-medium text-gold-600">{settings.currency} {b.balance.toFixed(2)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
