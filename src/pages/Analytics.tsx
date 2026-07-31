import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { Patient, Provider, PatientGroup, patientFullName, providerFullName, calculateAge, formatMoney, VISIT_STATUS_LABELS, VisitStatus } from '../types'
import { toYmd, fromYmd, formatDate } from '../lib/dates'

type Period = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom…' },
]
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
function periodRange(p: Period, cf: string, ct: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  switch (p) {
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) }
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) }
    case 'last_year':
      return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) }
    case 'custom':
      return { from: cf ? startOfDay(fromYmd(cf)) : null, to: ct ? endOfDay(fromYmd(ct)) : null }
    default:
      return { from: null, to: null }
  }
}
const inRange = (iso: string, from: Date | null, to: Date | null) => {
  const t = new Date(iso).getTime()
  return (!from || t >= from.getTime()) && (!to || t <= to.getTime())
}

type LedgerRow = { entry_type: string; amount: number; occurred_at: string; payment_method: string | null; patient_id: string }
type ExpenseRow = { amount: number; expense_date: string; category: string | null }
type VisitRow = { scheduled_at: string; status: VisitStatus; provider_id: string | null; patient_id: string | null }

const PALETTE = ['#b8874a', '#4f7cac', '#5a9e6f', '#c8734f', '#8a6fb0', '#c9a24b', '#5b8a8a', '#b3596e']

export default function Analytics() {
  const { settings } = useSettings()
  const money = (n: number) => formatMoney(n, settings)
  const [period, setPeriod] = useState<Period>('this_year')
  const [cf, setCf] = useState('')
  const [ct, setCt] = useState('')
  const [loading, setLoading] = useState(true)

  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [misc, setMisc] = useState<{ amount: number; occurred_at: string }[]>([])
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [groups, setGroups] = useState<PatientGroup[]>([])

  useEffect(() => {
    load()
  }, [])

  // Supabase caps a query at 1000 rows, so fetch large tables in batches.
  async function fetchAll(table: string, columns: string) {
    const CHUNK = 1000
    const all: any[] = []
    for (let f = 0; ; f += CHUNK) {
      const { data, error } = await supabase.from(table).select(columns).range(f, f + CHUNK - 1)
      if (error) break
      const b = (data as any[]) ?? []
      all.push(...b)
      if (b.length < CHUNK) break
    }
    return all
  }

  async function load() {
    setLoading(true)
    const [led, exp, mi, vis, pat, prov, grp] = await Promise.all([
      fetchAll('ledger_entries', 'entry_type, amount, occurred_at, payment_method, patient_id'),
      fetchAll('expenses', 'amount, expense_date, category'),
      fetchAll('misc_income', 'amount, occurred_at'),
      fetchAll('visits', 'scheduled_at, status, provider_id, patient_id'),
      fetchAll('patients', 'id, first_name, middle_name, last_name, title, gender, date_of_birth, provider_id, group_id, created_at'),
      supabase.from('providers').select('id, first_name, last_name').range(0, 9999),
      supabase.from('patient_groups').select('id, name').range(0, 9999),
    ])
    setLedger(led)
    setExpenses(exp)
    setMisc(mi)
    setVisits(vis)
    setPatients(pat)
    setProviders((prov.data as any) ?? [])
    setGroups((grp.data as any) ?? [])
    setLoading(false)
  }

  const providerName = (id: string | null) => {
    const p = providers.find((x) => x.id === id)
    return p ? providerFullName(p) : 'Unassigned'
  }
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? 'No group'

  const { from, to } = periodRange(period, cf, ct)

  // ---- period-scoped finance ----
  const stats = useMemo(() => {
    const pays = ledger.filter((l) => l.entry_type === 'payment' && inRange(l.occurred_at, from, to))
    const charges = ledger.filter((l) => l.entry_type === 'charge' && inRange(l.occurred_at, from, to))
    const discounts = ledger.filter((l) => l.entry_type === 'discount' && inRange(l.occurred_at, from, to))
    const exp = expenses.filter((e) => inRange(`${e.expense_date}T12:00:00`, from, to))
    const mis = misc.filter((m) => inRange(m.occurred_at, from, to))
    const revenue = pays.reduce((s, r) => s + Number(r.amount), 0)
    const otherIncome = mis.reduce((s, r) => s + Number(r.amount), 0)
    const expenseTotal = exp.reduce((s, r) => s + Number(r.amount), 0)
    const chargeTotal = charges.reduce((s, r) => s + Number(r.amount), 0)
    const discountTotal = discounts.reduce((s, r) => s + Number(r.amount), 0)
    const vis = visits.filter((v) => inRange(v.scheduled_at, from, to))
    const noShow = vis.filter((v) => v.status === 'missed' || v.status === 'cancelled').length
    const newPatients = patients.filter((p) => inRange(p.created_at, from, to)).length
    return {
      revenue,
      otherIncome,
      expenseTotal,
      net: revenue + otherIncome - expenseTotal,
      chargeTotal,
      discountTotal,
      collectionRate: chargeTotal > 0 ? (revenue / chargeTotal) * 100 : 0,
      visits: vis.length,
      noShowRate: vis.length > 0 ? (noShow / vis.length) * 100 : 0,
      newPatients,
    }
  }, [ledger, expenses, misc, visits, patients, from, to])

  // ---- breakdowns (period) ----
  const groupSum = <T,>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + valFn(r))
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }

  const expenseByCategory = useMemo(
    () => groupSum(expenses.filter((e) => inRange(`${e.expense_date}T12:00:00`, from, to)), (e) => e.category || 'Uncategorized', (e) => Number(e.amount)),
    [expenses, from, to],
  )
  const revenueByMethod = useMemo(
    () => groupSum(ledger.filter((l) => l.entry_type === 'payment' && inRange(l.occurred_at, from, to)), (l) => l.payment_method || 'other', (l) => Number(l.amount)),
    [ledger, from, to],
  )
  const visitsInPeriod = useMemo(() => visits.filter((v) => inRange(v.scheduled_at, from, to)), [visits, from, to])
  const visitsByStatus = useMemo(() => groupSum(visitsInPeriod, (v) => v.status, () => 1), [visitsInPeriod])
  const visitsByProvider = useMemo(() => groupSum(visitsInPeriod, (v) => providerName(v.provider_id), () => 1), [visitsInPeriod, providers])
  const visitsByWeekday = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const counts = days.map((d) => ({ label: d, value: 0 }))
    for (const v of visitsInPeriod) counts[new Date(v.scheduled_at).getDay()].value++
    return counts
  }, [visitsInPeriod])

  // ---- 12-month trends (independent of period) ----
  const months12 = useMemo(() => {
    const now = new Date()
    const arr: { key: string; label: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      arr.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: SHORT_MONTHS[d.getMonth()] })
    }
    return arr
  }, [])
  const trend = useMemo(() => {
    const idx: Record<string, { income: number; expense: number; visits: number; newPatients: number }> = {}
    for (const m of months12) idx[m.key] = { income: 0, expense: 0, visits: 0, newPatients: 0 }
    for (const l of ledger) if (l.entry_type === 'payment') { const k = l.occurred_at.slice(0, 7); if (idx[k]) idx[k].income += Number(l.amount) }
    for (const m of misc) { const k = m.occurred_at.slice(0, 7); if (idx[k]) idx[k].income += Number(m.amount) }
    for (const e of expenses) { const k = String(e.expense_date).slice(0, 7); if (idx[k]) idx[k].expense += Number(e.amount) }
    for (const v of visits) { const k = v.scheduled_at.slice(0, 7); if (idx[k]) idx[k].visits++ }
    for (const p of patients) { const k = String(p.created_at).slice(0, 7); if (idx[k]) idx[k].newPatients++ }
    return months12.map((m) => ({ label: m.label, ...idx[m.key] }))
  }, [months12, ledger, misc, expenses, visits, patients])

  // ---- all-time patient distributions ----
  const patientsByProvider = useMemo(() => groupSum(patients, (p) => providerName(p.provider_id), () => 1), [patients, providers])
  const patientsByGroup = useMemo(() => groupSum(patients, (p) => groupName(p.group_id), () => 1), [patients, groups])
  const genderSplit = useMemo(() => groupSum(patients, (p) => p.gender ?? 'Unspecified', () => 1), [patients])
  const ageBuckets = useMemo(() => {
    const buckets = [
      { label: '0–17', value: 0 },
      { label: '18–30', value: 0 },
      { label: '31–45', value: 0 },
      { label: '46–60', value: 0 },
      { label: '60+', value: 0 },
      { label: 'Unknown', value: 0 },
    ]
    for (const p of patients) {
      const a = calculateAge(p.date_of_birth)
      if (a == null) buckets[5].value++
      else if (a < 18) buckets[0].value++
      else if (a <= 30) buckets[1].value++
      else if (a <= 45) buckets[2].value++
      else if (a <= 60) buckets[3].value++
      else buckets[4].value++
    }
    return buckets
  }, [patients])

  // ---- outstanding + recall (all-time) ----
  const topDebtors = useMemo(() => {
    const bal = new Map<string, number>()
    for (const l of ledger) bal.set(l.patient_id, (bal.get(l.patient_id) ?? 0) + (l.entry_type === 'charge' ? Number(l.amount) : -Number(l.amount)))
    const rows = [...bal.entries()]
      .filter(([, v]) => v > 0.005)
      .map(([id, v]) => ({ id, name: patients.find((p) => p.id === id) ? patientFullName(patients.find((p) => p.id === id)!) : 'Unknown', value: v }))
      .sort((a, b) => b.value - a.value)
    return { rows: rows.slice(0, 10), total: rows.reduce((s, r) => s + r.value, 0), count: rows.length }
  }, [ledger, patients])

  const recall = useMemo(() => {
    const last = new Map<string, string>()
    for (const v of visits) {
      if (v.scheduled_at > new Date().toISOString()) continue
      if (!v.patient_id) continue
      const cur = last.get(v.patient_id)
      if (!cur || v.scheduled_at > cur) last.set(v.patient_id, v.scheduled_at)
    }
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 6)
    const cutoffIso = cutoff.toISOString()
    let never = 0
    let overdue = 0
    for (const p of patients) {
      const l = last.get(p.id)
      if (!l) never++
      else if (l < cutoffIso) overdue++
    }
    return { never, overdue }
  }, [visits, patients])

  if (loading) return <p className="text-navy-700">Loading analytics…</p>

  const maxTrendMoney = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)))
  const maxVisits = Math.max(1, ...trend.map((t) => t.visits))
  const maxNew = Math.max(1, ...trend.map((t) => t.newPatients))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Analytics</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {period === 'custom' && (
            <>
              <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              <span className="text-sm text-slate-500">to</span>
              <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </>
          )}
        </div>
      </div>

      {/* Finance KPIs */}
      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Finance — {PERIODS.find((p) => p.key === period)?.label}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Revenue (collected)" value={money(stats.revenue)} cls="text-green-600" />
          <Kpi label="Expenses" value={money(stats.expenseTotal)} cls="text-red-600" />
          <Kpi label="Net profit" value={money(stats.net)} cls={stats.net >= 0 ? 'text-green-600' : 'text-red-600'} />
          <Kpi label="Other income" value={money(stats.otherIncome)} cls="text-navy-900" />
          <Kpi label="Collection rate" value={`${stats.collectionRate.toFixed(0)}%`} sub={`${money(stats.revenue)} of ${money(stats.chargeTotal)} charged`} cls="text-navy-900" />
          <Kpi label="Discounts given" value={money(stats.discountTotal)} cls="text-amber-600" />
          <Kpi label="Visits" value={String(stats.visits)} cls="text-navy-900" />
          <Kpi label="No-show / cancel rate" value={`${stats.noShowRate.toFixed(0)}%`} cls={stats.noShowRate > 20 ? 'text-red-600' : 'text-navy-900'} />
        </div>
      </section>

      {/* 12-month trends */}
      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Income vs expenses — last 12 months</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" /> Income</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> Expenses</span>
          </div>
          <div className="flex items-end justify-between gap-1.5" style={{ height: 170 }}>
            {trend.map((t, i) => {
              const net = t.income - t.expense
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                    <div className="w-1/2 rounded-t bg-green-500" style={{ height: `${(t.income / maxTrendMoney) * 100}%` }} title={`Income ${money(t.income)}`} />
                    <div className="w-1/2 rounded-t bg-red-400" style={{ height: `${(t.expense / maxTrendMoney) * 100}%` }} title={`Expenses ${money(t.expense)}`} />
                  </div>
                  <p className="text-[10px] text-slate-500">{t.label}</p>
                  <p className={`text-[9px] font-medium ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{net >= 0 ? '+' : '−'}{Math.abs(net).toFixed(0)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Expenses by category">
          <BarList data={expenseByCategory} money={money} />
        </Panel>
        <Panel title="Revenue by payment method">
          <BarList data={revenueByMethod.map((r) => ({ label: r.label.replace('_', ' '), value: r.value }))} money={money} />
        </Panel>
        <Panel title="Visits by status">
          <BarList data={visitsByStatus.map((s) => ({ label: VISIT_STATUS_LABELS[s.label as VisitStatus] ?? s.label, value: s.value }))} />
        </Panel>
        <Panel title="Visits by provider">
          <BarList data={visitsByProvider} />
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Visits — trend & patterns</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Visits per month (last 12)">
            <MonthBars data={trend.map((t) => ({ label: t.label, value: t.visits }))} max={maxVisits} color="#4f7cac" />
          </Panel>
          <Panel title="Busiest weekday">
            <BarList data={visitsByWeekday} />
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-navy-800">Patients</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total patients" value={String(patients.length)} cls="text-navy-900" />
          <Kpi label="New this period" value={String(stats.newPatients)} cls="text-green-600" />
          <Link to="/patients" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-slate-500">Recall overdue (6m+)</p>
            <p className="text-xl font-semibold text-amber-700">{recall.overdue}</p>
          </Link>
          <Link to="/patients" className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Never visited</p>
            <p className="text-xl font-semibold text-navy-900">{recall.never}</p>
          </Link>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="New patients per month (last 12)">
            <MonthBars data={trend.map((t) => ({ label: t.label, value: t.newPatients }))} max={maxNew} color="#5a9e6f" />
          </Panel>
          <Panel title="Patients by age">
            <BarList data={ageBuckets} />
          </Panel>
          <Panel title="Patients by provider">
            <BarList data={patientsByProvider} />
          </Panel>
          <Panel title="Patients by group">
            <BarList data={patientsByGroup} />
          </Panel>
          <Panel title="Gender split">
            <BarList data={genderSplit.map((g) => ({ label: g.label[0].toUpperCase() + g.label.slice(1), value: g.value }))} />
          </Panel>
          <Panel title={`Top outstanding balances · total ${money(topDebtors.total)} (${topDebtors.count})`}>
            {topDebtors.rows.length === 0 ? (
              <p className="text-sm text-slate-500">No outstanding balances.</p>
            ) : (
              <div className="space-y-1.5">
                {topDebtors.rows.map((d) => (
                  <Link key={d.id} to={`/patients/${d.id}`} className="flex items-center justify-between text-sm hover:underline">
                    <span className="truncate text-navy-900">{d.name}</span>
                    <span className="font-medium text-gold-600">{money(d.value)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Financial and visit figures above the trends reflect the selected period; 12-month trends and patient distributions cover all data. As of {formatDate(new Date())}.
      </p>
    </div>
  )
}

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold ${cls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-navy-800">{title}</p>
      {children}
    </div>
  )
}

function BarList({ data, money }: { data: { label: string; value: number }[]; money?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="text-sm text-slate-500">No data.</p>
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="text-sm">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="truncate text-navy-800">{d.label}</span>
            <span className="ml-2 shrink-0 font-medium text-slate-600">{money ? money(d.value) : d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthBars({ data, max, color }: { data: { label: string; value: number }[]; max: number; color: string }) {
  return (
    <div className="flex items-end justify-between gap-1" style={{ height: 130 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end justify-center">
            <div className="w-2/3 rounded-t" style={{ height: `${(d.value / max) * 100}%`, backgroundColor: color }} title={`${d.value}`} />
          </div>
          <p className="text-[10px] text-slate-500">{d.label}</p>
          <p className="text-[9px] font-medium text-slate-600">{d.value}</p>
        </div>
      ))}
    </div>
  )
}
