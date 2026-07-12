import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { Visit, Patient, Location, patientFullName, telHref, whatsappHref } from '../types'
import { toYmd, fromYmd, startOfWeek, dayStart, dayEnd } from '../lib/dates'

type VisitRow = Visit & {
  patient: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'phone'> | null
  location: Pick<Location, 'name'> | null
}
type BalanceRow = { patient_id: string; full_name: string; balance: number }
type Stats = { visits: number; revenue: number; expenses: number; netProfit: number; newPatients: number }

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
const emptyStats: Stats = { visits: 0, revenue: 0, expenses: 0, netProfit: 0, newPatients: 0 }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Dashboard() {
  const { settings } = useSettings()
  const [todaysVisits, setTodaysVisits] = useState<VisitRow[]>([])
  const [tomorrowsVisits, setTomorrowsVisits] = useState<VisitRow[]>([])
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [weekStats, setWeekStats] = useState<Stats>(emptyStats)
  const [monthStats, setMonthStats] = useState<Stats>(emptyStats)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const monthLabel = `${MONTH_NAMES[now.getMonth()]}/${now.getFullYear()}`

  useEffect(() => {
    load()
  }, [settings.week_start_day])

  async function load() {
    setLoading(true)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const weekStart = fromYmd(startOfWeek(toYmd(now), settings.week_start_day))

    const [{ data: todays }, { data: tomorrows }, { data: ledgerRows }, weekData, monthData] = await Promise.all([
      supabase
        .from('visits')
        .select('*, patient:patients(id, first_name, middle_name, last_name, phone), location:locations(name)')
        .gte('scheduled_at', dayStart(toYmd(now)).toISOString())
        .lte('scheduled_at', dayEnd(toYmd(now)).toISOString())
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('visits')
        .select('*, patient:patients(id, first_name, middle_name, last_name, phone), location:locations(name)')
        .gte('scheduled_at', dayStart(toYmd(tomorrow)).toISOString())
        .lte('scheduled_at', dayEnd(toYmd(tomorrow)).toISOString())
        .order('scheduled_at', { ascending: true }),
      supabase.from('ledger_entries').select('patient_id, entry_type, amount, patients(first_name, middle_name, last_name)'),
      loadStats(weekStart, now),
      loadStats(startOfMonth(now), endOfMonth(now)),
    ])

    setTodaysVisits((todays as unknown as VisitRow[]) ?? [])
    setTomorrowsVisits((tomorrows as unknown as VisitRow[]) ?? [])
    setWeekStats(weekData)
    setMonthStats(monthData)

    const byPatient = new Map<string, BalanceRow>()
    for (const row of (ledgerRows as any[]) ?? []) {
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

    setLoading(false)
  }

  async function loadStats(from: Date, to: Date): Promise<Stats> {
    const [{ count: visits }, { data: payments }, { data: expenseRows }, { count: newPatients }] = await Promise.all([
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', from.toISOString())
        .lte('scheduled_at', to.toISOString()),
      supabase
        .from('ledger_entries')
        .select('amount')
        .eq('entry_type', 'payment')
        .gte('occurred_at', from.toISOString())
        .lte('occurred_at', to.toISOString()),
      supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', toYmd(from))
        .lte('expense_date', toYmd(to)),
      supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString()),
    ])
    const revenue = (payments ?? []).reduce((sum, p: any) => sum + Number(p.amount), 0)
    const expenseTotal = (expenseRows ?? []).reduce((sum, e: any) => sum + Number(e.amount), 0)
    return { visits: visits ?? 0, revenue, expenses: expenseTotal, netProfit: revenue - expenseTotal, newPatients: newPatients ?? 0 }
  }

  if (loading) return <p className="text-navy-700">Loading dashboard…</p>

  const appointmentSection = (title: string, list: VisitRow[]) => (
    <section>
      <h2 className="mb-3 text-lg font-medium text-navy-800">{title}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing scheduled.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list.map((v) => {
            const tel = telHref(v.patient?.phone ?? null)
            const wa = whatsappHref(v.patient?.phone ?? null)
            return (
              <div key={v.id} className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                <Link to={`/patients/${v.patient?.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-navy-900">{v.patient ? patientFullName(v.patient) : 'Unknown patient'}</p>
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
                  <p className="text-xs capitalize text-slate-500">{v.status}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  const statTiles = (stats: Stats) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Visits</p>
        <p className="text-xl font-semibold text-navy-900">{stats.visits}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Revenue</p>
        <p className="text-xl font-semibold text-green-600">{settings.currency} {stats.revenue.toFixed(0)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Expenses</p>
        <p className="text-xl font-semibold text-red-600">{settings.currency} {stats.expenses.toFixed(0)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Net profit</p>
        <p className={`text-xl font-semibold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{settings.currency} {stats.netProfit.toFixed(0)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">New patients</p>
        <p className="text-xl font-semibold text-navy-900">{stats.newPatients}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-navy-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {appointmentSection("Today's appointments", todaysVisits)}
        {appointmentSection("Tomorrow's appointments", tomorrowsVisits)}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">This week (since {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][settings.week_start_day]})</h2>
        {statTiles(weekStats)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">This month — {monthLabel}</h2>
        {statTiles(monthStats)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Outstanding balances</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-slate-500">No patients currently owe a balance.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {balances.map((b) => (
              <Link
                key={b.patient_id}
                to={`/patients/${b.patient_id}`}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <p className="font-medium text-navy-900">{b.full_name}</p>
                <p className="font-medium text-gold-600">EGP {b.balance.toFixed(2)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
