import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import {
  Expense,
  LedgerEntry,
  Patient,
  Provider,
  patientFullName,
  providerFullName,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PaymentMethod,
  EXPENSE_TYPE_LABELS,
  formatMoney,
  nowLocalDatetimeValue,
  RecurringExpense,
  RECURRENCE_PRESETS,
  RecurrenceEndType,
  recurrenceSummary,
  MiscIncome,
  telHref,
  whatsappHref,
  ExpenseCategory,
} from '../types'
import { toYmd, fromYmd, startOfWeek, formatDate, formatDateTime, toDatetimeLocal } from '../lib/dates'
import { exportOutstandingBalancesPdf } from '../lib/pdf'

type SideTab = 'cashflow' | 'income' | 'expenses' | 'outstanding'
type Period =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'all'
  | 'custom'

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range…' },
]

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

function periodRange(period: Period, weekStartDay: number, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  const today = startOfDay(now)
  switch (period) {
    case 'today':
      return { from: today, to: endOfDay(now) }
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case 'this_week':
      return { from: fromYmd(startOfWeek(toYmd(now), weekStartDay)), to: endOfDay(now) }
    case 'last_week': {
      const thisWeekStart = fromYmd(startOfWeek(toYmd(now), weekStartDay))
      const lastWeekStart = new Date(thisWeekStart)
      lastWeekStart.setDate(lastWeekStart.getDate() - 7)
      const lastWeekEnd = new Date(thisWeekStart)
      lastWeekEnd.setMilliseconds(-1)
      return { from: lastWeekStart, to: lastWeekEnd }
    }
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) }
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) }
    case 'last_year':
      return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) }
    case 'custom':
      return {
        from: customFrom ? startOfDay(fromYmd(customFrom)) : null,
        to: customTo ? endOfDay(fromYmd(customTo)) : null,
      }
    default:
      return { from: null, to: null }
  }
}

type IncomeRow = LedgerEntry & { patients: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name'> | null }
type ExpenseRow = Expense & { provider?: Pick<Provider, 'first_name' | 'last_name'> | null }

type CashItem = {
  id: string
  when: string
  label: string
  sublabel: string
  amount: number
  direction: 'in' | 'out'
  patientId?: string
}

type OutstandingRow = {
  patientId: string
  name: string
  phone: string | null
  balance: number
  lastActivity: string | null
}

export default function Balance() {
  const { session } = useAuth()
  const { settings } = useSettings()
  const [tab, setTab] = useState<SideTab>('cashflow')
  const [period, setPeriod] = useState<Period>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [income, setIncome] = useState<IncomeRow[]>([])
  const [miscIncome, setMiscIncome] = useState<MiscIncome[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editingMiscId, setEditingMiscId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([])
  const [outstandingLoading, setOutstandingLoading] = useState(false)

  // "Make this a recurring expense" controls
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [recurrencePreset, setRecurrencePreset] = useState('monthly')
  const [endType, setEndType] = useState<RecurrenceEndType>('never')
  const [endDate, setEndDate] = useState('')
  const [occurrences, setOccurrences] = useState('12')

  const money = (n: number) => formatMoney(n, settings)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo])

  useEffect(() => {
    if (tab === 'outstanding') loadOutstanding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadOutstanding() {
    setOutstandingLoading(true)
    // Every ledger entry, rolled up per patient. Charges add to the balance;
    // payments and discounts reduce it — so discounts correctly lower what is owed.
    const { data } = await supabase
      .from('ledger_entries')
      .select('patient_id, entry_type, amount, occurred_at, patients(id, first_name, middle_name, last_name, phone)')
    const byPatient = new Map<string, OutstandingRow>()
    for (const row of (data as any[]) ?? []) {
      if (!row.patient_id) continue
      const p = row.patients
      const ex =
        byPatient.get(row.patient_id) ??
        ({
          patientId: row.patient_id,
          name: p ? patientFullName(p) : 'Unknown patient',
          phone: p?.phone ?? null,
          balance: 0,
          lastActivity: null,
        } as OutstandingRow)
      ex.balance += row.entry_type === 'charge' ? Number(row.amount) : -Number(row.amount)
      if (!ex.lastActivity || row.occurred_at > ex.lastActivity) ex.lastActivity = row.occurred_at
      byPatient.set(row.patient_id, ex)
    }
    setOutstanding(
      Array.from(byPatient.values())
        .filter((r) => r.balance > 0.005)
        .sort((a, b) => b.balance - a.balance),
    )
    setOutstandingLoading(false)
  }

  const outstandingTotal = outstanding.reduce((s, r) => s + r.balance, 0)

  async function load() {
    setLoading(true)
    // Materialize any recurring expenses that have come due since last visit.
    await supabase.rpc('generate_due_recurring_expenses')
    supabase.from('recurring_expenses').select('*').eq('active', true).order('next_run_date').then(({ data }) => setRecurring((data as RecurringExpense[]) ?? []))
    supabase.from('expense_categories').select('*').eq('active', true).order('name').then(({ data }) => setCategories((data as ExpenseCategory[]) ?? []))
    const { from, to } = periodRange(period, settings.week_start_day, customFrom, customTo)
    if (period === 'custom' && (!from || !to)) {
      setIncome([])
      setMiscIncome([])
      setExpenses([])
      setLoading(false)
      return
    }

    let incomeQuery = supabase
      .from('ledger_entries')
      .select('*, patients(id, first_name, middle_name, last_name)')
      .eq('entry_type', 'payment')
      .order('occurred_at', { ascending: false })
    if (from) incomeQuery = incomeQuery.gte('occurred_at', from.toISOString())
    if (to) incomeQuery = incomeQuery.lte('occurred_at', to.toISOString())

    let expenseQuery = supabase
      .from('expenses')
      .select('*, provider:providers(first_name,last_name)')
      .order('occurred_at', { ascending: false })
    if (from) expenseQuery = expenseQuery.gte('occurred_at', from.toISOString())
    if (to) expenseQuery = expenseQuery.lte('occurred_at', to.toISOString())

    let miscQuery = supabase.from('misc_income').select('*').order('occurred_at', { ascending: false })
    if (from) miscQuery = miscQuery.gte('occurred_at', from.toISOString())
    if (to) miscQuery = miscQuery.lte('occurred_at', to.toISOString())

    const [{ data: incomeData }, { data: expenseData }, { data: miscData }] = await Promise.all([incomeQuery, expenseQuery, miscQuery])
    setIncome((incomeData as unknown as IncomeRow[]) ?? [])
    setExpenses((expenseData as unknown as ExpenseRow[]) ?? [])
    setMiscIncome((miscData as MiscIncome[]) ?? [])
    setLoading(false)
  }

  async function handleAddExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const occurred = occurredAt ? new Date(occurredAt as string) : new Date()

    if (makeRecurring) {
      // Create a template; the generation function then materializes the first (and any due) occurrences.
      const preset = RECURRENCE_PRESETS.find((p) => p.value === recurrencePreset) ?? RECURRENCE_PRESETS[2]
      const startDate = occurred.toISOString().slice(0, 10)
      const { error } = await supabase.from('recurring_expenses').insert({
        description: form.get('description'),
        category: form.get('category') || null,
        amount: form.get('amount'),
        payment_method: form.get('payment_method') || null,
        interval_unit: preset.unit,
        interval_count: preset.count,
        start_date: startDate,
        next_run_date: startDate,
        end_type: endType,
        end_date: endType === 'until' ? endDate || null : null,
        occurrences: endType === 'count' ? Number(occurrences) || null : null,
        entered_by: session?.user.id,
      })
      if (error) {
        alert(error.message)
        return
      }
      await supabase.rpc('generate_due_recurring_expenses')
    } else {
      const { error } = await supabase.from('expenses').insert({
        description: form.get('description'),
        category: form.get('category') || null,
        amount: form.get('amount'),
        payment_method: form.get('payment_method') || null,
        expense_type: 'general',
        occurred_at: occurred.toISOString(),
        expense_date: occurred.toISOString().slice(0, 10),
        entered_by: session?.user.id,
      })
      if (error) {
        alert(error.message)
        return
      }
    }
    e.currentTarget.reset()
    setMakeRecurring(false)
    load()
  }

  async function handleStopRecurring(id: string) {
    if (!confirm('Stop this recurring expense? Already-recorded expenses stay; no new ones will be created.')) return
    const { error } = await supabase.from('recurring_expenses').update({ active: false }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function handleSaveExpenseEdit(e: FormEvent<HTMLFormElement>, expense: ExpenseRow) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const { error } = await supabase
      .from('expenses')
      .update({
        description: form.get('description'),
        category: form.get('category') || null,
        amount: form.get('amount'),
        payment_method: form.get('payment_method') || null,
        occurred_at: occurredAt ? new Date(occurredAt as string).toISOString() : undefined,
        expense_date: occurredAt ? new Date(occurredAt as string).toISOString().slice(0, 10) : undefined,
      })
      .eq('id', expense.id)
    if (error) alert(error.message)
    else {
      setEditingExpenseId(null)
      load()
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function handleSaveMiscEdit(e: FormEvent<HTMLFormElement>, m: MiscIncome) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const { error } = await supabase
      .from('misc_income')
      .update({
        description: form.get('description'),
        amount: form.get('amount'),
        occurred_at: occurredAt ? new Date(occurredAt as string).toISOString() : undefined,
        income_date: occurredAt ? new Date(occurredAt as string).toISOString().slice(0, 10) : undefined,
      })
      .eq('id', m.id)
    if (error) alert(error.message)
    else {
      setEditingMiscId(null)
      load()
    }
  }

  async function handleDeleteMisc(id: string) {
    if (!confirm('Delete this income entry? This cannot be undone.\n\nNote: if it came from a staff loan repayment and that loan still exists in HR, undo it from HR → Deductions instead so the loan balance stays correct.')) return
    const { error } = await supabase.from('misc_income').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  const miscIncomeTotal = miscIncome.reduce((sum, r) => sum + Number(r.amount), 0)
  const incomeTotal = income.reduce((sum, r) => sum + Number(r.amount), 0) + miscIncomeTotal
  const expensesTotal = expenses.reduce((sum, r) => sum + Number(r.amount), 0)
  const net = incomeTotal - expensesTotal

  const cashItems: CashItem[] = useMemo(() => {
    const items: CashItem[] = [
      ...income.map((r) => ({
        id: `in-${r.id}`,
        when: r.occurred_at,
        label: r.patients ? patientFullName(r.patients) : 'Payment',
        sublabel: `Payment${r.payment_method ? ` · ${PAYMENT_METHOD_LABELS[r.payment_method]}` : ''}`,
        amount: Number(r.amount),
        direction: 'in' as const,
        patientId: r.patients?.id,
      })),
      ...miscIncome.map((r) => ({
        id: `mi-${r.id}`,
        when: r.occurred_at,
        label: r.description,
        sublabel: `Other income${r.category ? ` · ${r.category}` : ''}`,
        amount: Number(r.amount),
        direction: 'in' as const,
      })),
      ...expenses.map((r) => ({
        id: `ex-${r.id}`,
        when: r.occurred_at,
        label: r.description,
        sublabel: `${EXPENSE_TYPE_LABELS[r.expense_type]}${r.provider ? ` · ${providerFullName(r.provider)}` : ''}${r.payment_method ? ` · ${PAYMENT_METHOD_LABELS[r.payment_method]}` : ''}`,
        // A negative expense is a credit (e.g. a settled staff loan coming back) → treat as money in.
        amount: Math.abs(Number(r.amount)),
        direction: (Number(r.amount) < 0 ? 'in' : 'out') as 'in' | 'out',
      })),
    ]
    return items.sort((a, b) => b.when.localeCompare(a.when))
  }, [income, miscIncome, expenses])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy-900">Finances</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 text-sm">
          {(['cashflow', 'income', 'expenses', 'outstanding'] as SideTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 capitalize ${tab === t ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab !== 'outstanding' && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            {period === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                <span className="text-sm text-slate-500">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </>
            )}
          </div>
        )}
      </div>

      {tab === 'outstanding' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Total outstanding</p>
                <p className="text-lg font-semibold text-gold-600">{money(outstandingTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Patients who owe</p>
                <p className="text-lg font-semibold text-navy-900">{outstanding.length}</p>
              </div>
            </div>
            <button
              onClick={() =>
                exportOutstandingBalancesPdf(
                  settings.currency,
                  outstanding.map((r) => ({ name: r.name, phone: r.phone, lastActivity: r.lastActivity ? formatDate(r.lastActivity) : null, balance: r.balance })),
                )
              }
              disabled={outstanding.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50 disabled:opacity-40"
            >
              Export (PDF)
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {outstandingLoading ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : outstanding.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No patient currently owes a balance. 🎉</p>
            ) : (
              outstanding.map((r) => {
                const tel = telHref(r.phone)
                const wa = whatsappHref(r.phone)
                return (
                  <div key={r.patientId} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                    <div className="min-w-0">
                      <Link to={`/patients/${r.patientId}`} className="font-medium text-navy-900 hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {r.phone || 'No phone'}
                        {r.lastActivity ? ` · last activity ${formatDate(r.lastActivity)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {tel && (
                        <a href={tel} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-slate-100" title="Call">
                          Call
                        </a>
                      )}
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50" title="WhatsApp">
                          WhatsApp
                        </a>
                      )}
                      <p className="w-28 text-right font-semibold text-gold-600">{money(r.balance)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : tab === 'cashflow' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Income</p>
              <p className="text-lg font-semibold text-green-600">{money(incomeTotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Expenses</p>
              <p className="text-lg font-semibold text-red-600">{money(expensesTotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Net cashflow</p>
              <p className={`text-lg font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(net)}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {cashItems.length === 0 && <p className="p-4 text-sm text-slate-500">No transactions in this period.</p>}
            {cashItems.map((it) => {
              const row = (
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-navy-900">{it.label}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(it.when)} · {it.sublabel}
                    </p>
                  </div>
                  <p className={`font-medium ${it.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {it.direction === 'in' ? '+' : '−'}
                    {money(it.amount)}
                  </p>
                </div>
              )
              return it.patientId ? (
                <Link key={it.id} to={`/patients/${it.patientId}`}>
                  {row}
                </Link>
              ) : (
                <div key={it.id}>{row}</div>
              )
            })}
          </div>
        </div>
      ) : tab === 'income' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total income</p>
            <p className="text-2xl font-semibold text-green-600">{money(incomeTotal)}</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {income.length === 0 && miscIncome.length === 0 && <p className="p-4 text-sm text-slate-500">No income in this period.</p>}
            {income.map((r) => (
              <Link
                key={r.id}
                to={r.patients ? `/patients/${r.patients.id}` : '#'}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-navy-900">{r.patients ? patientFullName(r.patients) : 'Unknown patient'}</p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(r.occurred_at)} · {PAYMENT_METHOD_LABELS[(r.payment_method ?? 'other') as PaymentMethod]}
                  </p>
                </div>
                <p className="font-medium text-green-600">+{money(Number(r.amount))}</p>
              </Link>
            ))}
            {miscIncome.map((r) =>
              editingMiscId === r.id ? (
                <form key={r.id} onSubmit={(ev) => handleSaveMiscEdit(ev, r)} className="space-y-2 border-b border-slate-100 px-4 py-3 last:border-0">
                  <input name="description" defaultValue={r.description} placeholder="Description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input name="amount" type="number" step="0.01" required defaultValue={r.amount} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input name="occurred_at" type="datetime-local" defaultValue={toDatetimeLocal(r.occurred_at)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingMiscId(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">{r.description}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(r.occurred_at)} · Other income{r.category ? ` · ${r.category}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-medium text-green-600">+{money(Number(r.amount))}</p>
                    <button onClick={() => setEditingMiscId(r.id)} className="text-xs font-medium text-navy-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteMisc(r.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total expenses</p>
            <p className="text-2xl font-semibold text-red-600">{money(expensesTotal)}</p>
          </div>

          <form onSubmit={handleAddExpense} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <input name="description" required placeholder="Description (e.g. Dental supplies)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select name="category" defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Category (optional)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" min="0" required placeholder={`Amount (${settings.currency})`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select name="payment_method" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <input name="occurred_at" type="datetime-local" defaultValue={nowLocalDatetimeValue()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />

            <label className="flex items-center gap-2 text-sm font-medium text-navy-800 sm:col-span-2">
              <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
              🔁 Make this a recurring expense
            </label>
            {makeRecurring && (
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Repeat</label>
                  <select value={recurrencePreset} onChange={(e) => setRecurrencePreset(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {RECURRENCE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Ends</label>
                  <select value={endType} onChange={(e) => setEndType(e.target.value as RecurrenceEndType)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="never">Never (until stopped)</option>
                    <option value="until">On a date</option>
                    <option value="count">After a number of times</option>
                  </select>
                </div>
                {endType === 'until' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">End date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                )}
                {endType === 'count' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Number of times</label>
                    <input type="number" min="1" value={occurrences} onChange={(e) => setOccurrences(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                )}
                <p className="text-xs text-slate-500 sm:col-span-2">The date above is the first occurrence; the system records each one automatically as it comes due.</p>
              </div>
            )}

            <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 sm:col-span-2">
              {makeRecurring ? 'Add recurring expense' : 'Add expense'}
            </button>
          </form>

          {recurring.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-navy-900">🔁 Active recurring expenses</p>
              {recurring.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-navy-900">
                      {r.description} · <span className="font-medium">{money(Number(r.amount))}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {recurrenceSummary(r)} · next on {formatDate(r.next_run_date)}
                    </p>
                  </div>
                  <button onClick={() => handleStopRecurring(r.id)} className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                    Stop
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {expenses.length === 0 && <p className="p-4 text-sm text-slate-500">No expenses in this period.</p>}
            {expenses.map((e) =>
              editingExpenseId === e.id ? (
                <form key={e.id} onSubmit={(ev) => handleSaveExpenseEdit(ev, e)} className="space-y-2 border-b border-slate-100 px-4 py-3 last:border-0">
                  <input name="description" defaultValue={e.description} placeholder="Description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input name="amount" type="number" step="0.01" required defaultValue={e.amount} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <select name="category" defaultValue={e.category ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Uncategorized</option>
                      {e.category && !categories.some((c) => c.name === e.category) && <option value={e.category}>{e.category}</option>}
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select name="payment_method" defaultValue={e.payment_method ?? 'cash'} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                    <input name="occurred_at" type="datetime-local" defaultValue={toDatetimeLocal(e.occurred_at)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingExpenseId(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-navy-900">
                      {e.description} {e.recurring_expense_id && <span title="From a recurring expense" className="text-xs">🔁</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(e.occurred_at)} · {EXPENSE_TYPE_LABELS[e.expense_type]}
                      {e.provider ? ` · ${providerFullName(e.provider)}` : ''}
                      {e.payment_method ? ` · ${PAYMENT_METHOD_LABELS[e.payment_method]}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {Number(e.amount) < 0 ? (
                      <p className="font-medium text-green-600">+{money(Math.abs(Number(e.amount)))}</p>
                    ) : (
                      <p className="font-medium text-red-600">−{money(Number(e.amount))}</p>
                    )}
                    <button onClick={() => setEditingExpenseId(e.id)} className="text-xs font-medium text-navy-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteExpense(e.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
