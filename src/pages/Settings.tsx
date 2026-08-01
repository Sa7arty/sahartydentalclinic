import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { Provider, PatientGroup, ProcedureCategory, Procedure, ExpenseCategory, ExpenseItem, providerFullName, REQUIRABLE_PATIENT_FIELDS, DENTAL_SPECIALTIES } from '../types'
import { WORLD_COUNTRIES } from '../data/countries'
import { WEEKDAY_NAMES_FROM } from '../lib/dates'
import { exportPatientsCsv, downloadPatientImportTemplate, importPatientsFromCsv } from '../lib/csv'

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 75, 90, 120]
const WEEKDAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Category = 'patients' | 'calendar' | 'providers' | 'procedures' | 'price-list' | 'financial' | 'team' | 'backup'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'patients', label: 'Patients' },
  { key: 'calendar', label: 'Calendar & scheduling' },
  { key: 'providers', label: 'Providers' },
  { key: 'procedures', label: 'Procedures' },
  { key: 'price-list', label: 'Price list' },
  { key: 'financial', label: 'Financial' },
  { key: 'team', label: 'Team & access' },
  { key: 'backup', label: 'Backup & import' },
]

const TEAM_ROLES: { value: string; label: string }[] = [
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'provider', label: 'Provider (dentist)' },
  { value: 'dentist', label: 'Owner (full access)' },
]
type TeamMember = { id: string; full_name: string | null; email: string | null; roles: string[] }

const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'

export default function Settings() {
  const { isDentist, session } = useAuth()
  const { settings, refresh } = useSettings()
  const [category, setCategory] = useState<Category>('patients')

  const [requiredFields, setRequiredFields] = useState<string[]>(settings.required_fields)
  const [elderlyAge, setElderlyAge] = useState(settings.elderly_age_threshold)
  const [patientsPerPage, setPatientsPerPage] = useState(settings.rows_per_page)
  const [savingPatients, setSavingPatients] = useState(false)

  const [digitLength, setDigitLength] = useState(settings.id_digit_length)
  const [autoGenerate, setAutoGenerate] = useState(settings.auto_generate_file_number)
  const [savingFileNumbers, setSavingFileNumbers] = useState(false)
  const [nextPreview, setNextPreview] = useState<string | null>(null)
  const [counterValue, setCounterValue] = useState('')
  const [savingCounter, setSavingCounter] = useState(false)

  const [weekStartDay, setWeekStartDay] = useState(settings.week_start_day)
  const [defaultDuration, setDefaultDuration] = useState(settings.default_visit_duration_minutes)
  const [savingCalendar, setSavingCalendar] = useState(false)

  const [providers, setProviders] = useState<Provider[]>([])
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [showAddProvider, setShowAddProvider] = useState(false)

  const [groups, setGroups] = useState<PatientGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')

  const [conditions, setConditions] = useState<{ id: string; name: string; active: boolean }[]>([])
  const [newConditionName, setNewConditionName] = useState('')

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [newExpenseCategory, setNewExpenseCategory] = useState('')
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([])
  const [newExpenseItem, setNewExpenseItem] = useState<Record<string, string>>({})

  const [team, setTeam] = useState<TeamMember[]>([])
  const [addingMember, setAddingMember] = useState(false)
  const [memberMsg, setMemberMsg] = useState<string | null>(null)

  const [procCategories, setProcCategories] = useState<ProcedureCategory[]>([])
  const [newProcCategory, setNewProcCategory] = useState('')
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [editingProcedureId, setEditingProcedureId] = useState<string | null>(null)
  const [showAddProcedure, setShowAddProcedure] = useState(false)
  const [procFilter, setProcFilter] = useState<string>('all')

  const [currency, setCurrency] = useState(settings.currency)
  const [defaultCountry, setDefaultCountry] = useState(settings.default_country ?? '')
  const [defaultNationality, setDefaultNationality] = useState(settings.default_nationality ?? '')
  const [profitSharePercent, setProfitSharePercent] = useState(settings.profit_share_percent)
  const [salaryPeriodStartDay, setSalaryPeriodStartDay] = useState(settings.salary_period_start_day)
  const [salaryPayDay, setSalaryPayDay] = useState(settings.salary_pay_day)
  const [leaveEligibilityMonths, setLeaveEligibilityMonths] = useState(settings.leave_eligibility_months)
  const [midnightMultiplier, setMidnightMultiplier] = useState(settings.overtime_midnight_multiplier)
  const [earlyOtCap, setEarlyOtCap] = useState(settings.early_overtime_cap_hours)
  const [salaryRounding, setSalaryRounding] = useState(settings.salary_rounding)
  const [weeklyOffDay, setWeeklyOffDay] = useState(settings.weekly_off_day)
  const [lateGraceMinutes, setLateGraceMinutes] = useState(settings.late_grace_minutes)
  const [bigDebtThreshold, setBigDebtThreshold] = useState(settings.big_debt_threshold)
  const [savingFinancial, setSavingFinancial] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)

  useEffect(() => {
    setRequiredFields(settings.required_fields)
    setElderlyAge(settings.elderly_age_threshold)
    setPatientsPerPage(settings.rows_per_page)
    setDigitLength(settings.id_digit_length)
    setAutoGenerate(settings.auto_generate_file_number)
    setWeekStartDay(settings.week_start_day)
    setDefaultDuration(settings.default_visit_duration_minutes)
    setCurrency(settings.currency)
    setDefaultCountry(settings.default_country ?? '')
    setDefaultNationality(settings.default_nationality ?? '')
    setProfitSharePercent(settings.profit_share_percent)
    setSalaryPeriodStartDay(settings.salary_period_start_day)
    setSalaryPayDay(settings.salary_pay_day)
    setLeaveEligibilityMonths(settings.leave_eligibility_months)
    setMidnightMultiplier(settings.overtime_midnight_multiplier)
    setEarlyOtCap(settings.early_overtime_cap_hours)
    setSalaryRounding(settings.salary_rounding)
    setWeeklyOffDay(settings.weekly_off_day)
    setLateGraceMinutes(settings.late_grace_minutes)
    setBigDebtThreshold(settings.big_debt_threshold)
  }, [settings])

  useEffect(() => {
    loadPreview()
    loadProviders()
    loadGroups()
    loadConditions()
    loadProcedureCategories()
    loadProcedures()
    loadExpenseCategories()
    loadTeam()
  }, [])

  async function loadTeam() {
    const [{ data: profs }, { data: roleRows }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('user_roles').select('user_id, role'),
    ])
    const rolesByUser: Record<string, string[]> = {}
    for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) (rolesByUser[r.user_id] = rolesByUser[r.user_id] ?? []).push(r.role)
    setTeam(((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => ({ ...p, roles: rolesByUser[p.id] ?? [] })))
  }

  async function handleAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const role = f.get('role') as string
    setAddingMember(true)
    setMemberMsg(null)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        full_name: f.get('full_name'),
        email: f.get('email'),
        password: f.get('password'),
        role,
        provider_id: role === 'provider' ? f.get('provider_id') || null : null,
      },
    })
    setAddingMember(false)
    if (error || (data && (data as { error?: string }).error)) {
      setMemberMsg(`⚠ ${(data as { error?: string })?.error ?? error?.message ?? 'Could not add member'}`)
      return
    }
    setMemberMsg('✓ Team member added. Share the email + temporary password with them; they can change it after signing in.')
    ;(e.target as HTMLFormElement).reset()
    loadTeam()
  }

  async function handleSetRole(userId: string, role: string) {
    // Replace the member's role with the chosen one (single-role model for now).
    await supabase.from('user_roles').delete().eq('user_id', userId)
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role })
    if (error) alert(error.message)
    else loadTeam()
  }

  async function loadPreview() {
    const { data } = await supabase.rpc('peek_next_patient_file_number')
    if (typeof data === 'string') setNextPreview(data)
  }
  async function loadProviders() {
    const { data } = await supabase.from('providers').select('*').order('first_name')
    setProviders(data ?? [])
  }
  async function loadGroups() {
    const { data } = await supabase.from('patient_groups').select('*').order('name')
    setGroups(data ?? [])
  }
  async function loadConditions() {
    const { data } = await supabase.from('medical_conditions').select('*').order('name')
    setConditions(data ?? [])
  }
  async function loadProcedureCategories() {
    const { data } = await supabase.from('procedure_categories').select('*').order('name')
    setProcCategories(data ?? [])
  }
  async function loadProcedures() {
    const { data } = await supabase.from('procedures').select('*, category:procedure_categories(name)').order('name')
    setProcedures((data as unknown as Procedure[]) ?? [])
  }

  // ---- groups ----
  async function handleAddGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    const { error } = await supabase.from('patient_groups').insert({ name })
    if (error) alert(error.message)
    else {
      setNewGroupName('')
      loadGroups()
    }
  }
  async function handleRenameGroup(id: string, name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('patient_groups').update({ name: name.trim() }).eq('id', id)
    if (error) alert(error.message)
    else loadGroups()
  }
  async function handleToggleGroupActive(id: string, active: boolean) {
    const { error } = await supabase.from('patient_groups').update({ active }).eq('id', id)
    if (error) alert(error.message)
    else loadGroups()
  }

  // ---- medical conditions list ----
  async function handleAddCondition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newConditionName.trim()
    if (!name) return
    const { error } = await supabase.from('medical_conditions').insert({ name })
    if (error) alert(error.message)
    else {
      setNewConditionName('')
      loadConditions()
    }
  }
  async function handleDeleteCondition(id: string) {
    const { error } = await supabase.from('medical_conditions').delete().eq('id', id)
    if (error) alert(error.message)
    else loadConditions()
  }

  // ---- expense categories list ----
  async function loadExpenseCategories() {
    const { data } = await supabase.from('expense_categories').select('*').order('name')
    setExpenseCategories((data as ExpenseCategory[]) ?? [])
    const { data: items } = await supabase.from('expense_items').select('*').order('name')
    setExpenseItems((items as ExpenseItem[]) ?? [])
  }
  async function handleAddExpenseCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newExpenseCategory.trim()
    if (!name) return
    const { error } = await supabase.from('expense_categories').insert({ name })
    if (error) alert(error.message)
    else {
      setNewExpenseCategory('')
      loadExpenseCategories()
    }
  }
  async function handleDeleteExpenseCategory(id: string) {
    if (!confirm('Delete this category and its items?')) return
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) alert(error.message)
    else loadExpenseCategories()
  }
  async function handleAddExpenseItem(categoryId: string) {
    const name = (newExpenseItem[categoryId] ?? '').trim()
    if (!name) return
    const { error } = await supabase.from('expense_items').insert({ category_id: categoryId, name })
    if (error) alert(error.message)
    else {
      setNewExpenseItem((m) => ({ ...m, [categoryId]: '' }))
      loadExpenseCategories()
    }
  }
  async function handleDeleteExpenseItem(id: string) {
    const { error } = await supabase.from('expense_items').delete().eq('id', id)
    if (error) alert(error.message)
    else loadExpenseCategories()
  }
  async function updateExpenseReq(patch: Record<string, boolean>) {
    const { error } = await supabase.from('app_settings').update(patch).eq('id', true)
    if (error) alert(error.message)
    else await refresh()
  }

  // ---- procedures ----
  async function handleAddProcCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newProcCategory.trim()
    if (!name) return
    const { error } = await supabase.from('procedure_categories').insert({ name })
    if (error) alert(error.message)
    else {
      setNewProcCategory('')
      loadProcedureCategories()
    }
  }
  async function handleRenameProcCategory(id: string, name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('procedure_categories').update({ name: name.trim() }).eq('id', id)
    if (error) alert(error.message)
    else loadProcedureCategories()
  }
  async function handleSaveProcedure(payload: Record<string, unknown>, id?: string) {
    const { error } = id ? await supabase.from('procedures').update(payload).eq('id', id) : await supabase.from('procedures').insert(payload)
    if (error) {
      alert(error.message)
      return
    }
    setEditingProcedureId(null)
    setShowAddProcedure(false)
    loadProcedures()
  }
  async function handleDeleteProcedure(id: string) {
    if (!confirm('Delete this procedure?')) return
    const { error } = await supabase.from('procedures').delete().eq('id', id)
    if (error) alert(error.message)
    else loadProcedures()
  }
  async function handleUpdatePrice(id: string, price: string) {
    const value = price.trim() === '' ? null : Number(price)
    const { error } = await supabase.from('procedures').update({ default_price: value }).eq('id', id)
    if (error) alert(error.message)
    else loadProcedures()
  }

  // ---- app_settings saves ----
  async function handleSaveFinancial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingFinancial(true)
    const { error } = await supabase
      .from('app_settings')
      .update({
        currency: currency.trim() || 'EGP',
        default_country: defaultCountry.trim() || null,
        default_nationality: defaultNationality.trim() || null,
        profit_share_percent: profitSharePercent,
        salary_period_start_day: salaryPeriodStartDay,
        salary_pay_day: salaryPayDay,
        leave_eligibility_months: leaveEligibilityMonths,
        overtime_midnight_multiplier: midnightMultiplier,
        early_overtime_cap_hours: earlyOtCap,
        salary_rounding: salaryRounding,
        weekly_off_day: weeklyOffDay,
        late_grace_minutes: lateGraceMinutes,
        big_debt_threshold: bigDebtThreshold,
      })
      .eq('id', true)
    setSavingFinancial(false)
    if (error) alert(error.message)
    else await refresh()
  }
  async function handleSavePatients(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingPatients(true)
    const { error } = await supabase.from('app_settings').update({ required_fields: requiredFields, elderly_age_threshold: elderlyAge, rows_per_page: patientsPerPage }).eq('id', true)
    setSavingPatients(false)
    if (error) alert(error.message)
    else await refresh()
  }
  async function handleSaveFileNumbers(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingFileNumbers(true)
    const { error } = await supabase.from('app_settings').update({ id_digit_length: digitLength, auto_generate_file_number: autoGenerate }).eq('id', true)
    if (!error) {
      // Re-pad every existing file number so past files match the new digit count too.
      const { error: repadError } = await supabase.rpc('repad_patient_file_numbers', { new_digits: digitLength })
      if (repadError) alert(repadError.message)
    }
    setSavingFileNumbers(false)
    if (error) alert(error.message)
    else {
      await refresh()
      await loadPreview()
    }
  }
  async function handleSaveCalendar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSavingCalendar(true)
    const { error } = await supabase.from('app_settings').update({ week_start_day: weekStartDay, default_visit_duration_minutes: defaultDuration }).eq('id', true)
    setSavingCalendar(false)
    if (error) alert(error.message)
    else await refresh()
  }
  async function handleSetCounter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Number(counterValue)
    if (!Number.isInteger(n) || n < 0) return alert('Enter a whole number.')
    setSavingCounter(true)
    const { error } = await supabase.rpc('set_patient_file_number_counter', { new_value: n })
    setSavingCounter(false)
    if (error) alert(error.message)
    else {
      setCounterValue('')
      await loadPreview()
    }
  }
  async function handleSaveProvider(payload: Record<string, unknown>, id?: string) {
    const { error } = id ? await supabase.from('providers').update(payload).eq('id', id) : await supabase.from('providers').insert(payload)
    if (error) {
      alert(error.message)
      return
    }
    setEditingProviderId(null)
    setShowAddProvider(false)
    loadProviders()
  }
  async function handleDeleteProvider(id: string) {
    if (!confirm('Delete this provider? Patients and visits assigned to them will keep their history but show no provider.')) return
    const { error } = await supabase.from('providers').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      setEditingProviderId(null)
      loadProviders()
    }
  }
  async function handleExportCsv() {
    const { data } = await supabase.from('patients').select('*, provider:providers(first_name, last_name)')
    exportPatientsCsv(data ?? [])
  }
  async function handleImportCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportSummary(null)
    try {
      const result = await importPatientsFromCsv(file, supabase, settings.auto_generate_file_number)
      setImportSummary(`Imported ${result.success} patient(s).${result.failed > 0 ? ` ${result.failed} row(s) failed — see console for details.` : ''}`)
    } catch (err: any) {
      setImportSummary(`Import failed: ${err.message}`)
    }
    setImporting(false)
  }

  if (!isDentist) {
    return <p className="text-sm text-slate-500">Settings are visible to dentists only.</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy-900">Settings</h1>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              category === c.key ? 'border-gold-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-700'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === 'patients' && (
        <div className="space-y-4">
          {/* mandatory fields + markers */}
          <form onSubmit={handleSavePatients} className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Mandatory fields for a new patient</h2>
              <p className="text-sm text-slate-500">Chosen fields must be filled before a patient file can be saved.</p>
            </div>
            <MandatoryFieldsDropdown selected={requiredFields} onChange={setRequiredFields} />
            <div className="border-t border-slate-100 pt-4">
              <h2 className="font-medium text-navy-900">Patient list markers</h2>
              <label className="mt-2 block text-sm text-slate-600">
                Mark patients as "Senior" starting at age
                <input type="number" min={1} value={elderlyAge} onChange={(e) => setElderlyAge(Number(e.target.value))} className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-1" />
              </label>
              <p className="mt-1 text-xs text-slate-400">Patients with recorded conditions are always marked "Medical".</p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h2 className="font-medium text-navy-900">Rows per page (all lists)</h2>
              <label className="mt-2 block text-sm text-slate-600">
                Show
                <select value={patientsPerPage} onChange={(e) => setPatientsPerPage(Number(e.target.value))} className="mx-2 rounded-lg border border-slate-300 px-2 py-1">
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                rows per page
              </label>
              <p className="mt-1 text-xs text-slate-400">Applies to every paged list — patients, expenses, and more.</p>
            </div>
            <button type="submit" disabled={savingPatients} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {savingPatients ? 'Saving…' : 'Save'}
            </button>
          </form>

          {/* medical conditions list management */}
          <div className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Medical conditions list</h2>
              <p className="text-sm text-slate-500">These appear in the searchable dropdown on a patient's Medical history tab.</p>
            </div>
            <form onSubmit={handleAddCondition} className="flex flex-wrap items-end gap-3">
              <input value={newConditionName} onChange={(e) => setNewConditionName(e.target.value)} placeholder="e.g. Sleep apnea" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                + Add condition
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {conditions.length === 0 && <p className="text-sm text-slate-500">No conditions.</p>}
              {conditions.map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-navy-800">
                  {c.name}
                  <button onClick={() => handleDeleteCondition(c.id)} title="Remove" className="rounded-full px-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* groups */}
          <div className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Patient groups</h2>
              <p className="text-sm text-slate-500">Groups you can assign to patients (e.g. Family, VIP). Uncheck "Active" to hide from new patients.</p>
            </div>
            <form onSubmit={handleAddGroup} className="flex flex-wrap items-end gap-3">
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Insurance" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                + Add group
              </button>
            </form>
            <div className="divide-y divide-slate-100">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 py-2">
                  <input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && handleRenameGroup(g.id, e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <label className="flex items-center gap-2 text-sm text-navy-800">
                    <input type="checkbox" checked={g.active} onChange={(e) => handleToggleGroupActive(g.id, e.target.checked)} />
                    Active
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* file numbers */}
          <form onSubmit={handleSaveFileNumbers} className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Patient file numbers</h2>
              <p className="text-sm text-slate-500">File numbers count up automatically and never reuse a deleted number.</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-sm text-slate-500">Number of digits</label>
                <select value={digitLength} onChange={(e) => setDigitLength(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-navy-800">
                <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} />
                Auto-generate file numbers
              </label>
              {nextPreview && (
                <p className="text-sm text-slate-500">
                  Next number: <span className="font-medium text-navy-900">{nextPreview}</span>
                </p>
              )}
            </div>
            <button type="submit" disabled={savingFileNumbers} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {savingFileNumbers ? 'Saving…' : 'Save'}
            </button>
          </form>

          <form onSubmit={handleSetCounter} className={card}>
            <h2 className="font-medium text-navy-900">Change the file number counter</h2>
            <p className="text-sm text-slate-500">The next patient will get this number + 1. Use only to realign the counter (e.g. to match old paper files).</p>
            <div className="flex flex-wrap items-end gap-3">
              <input type="number" min={0} step={1} value={counterValue} onChange={(e) => setCounterValue(e.target.value)} placeholder="e.g. 788" className="w-40 rounded-lg border border-slate-300 px-3 py-2" />
              <button type="submit" disabled={savingCounter} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400 disabled:opacity-50">
                {savingCounter ? 'Updating…' : 'Update counter'}
              </button>
            </div>
          </form>
        </div>
      )}

      {category === 'calendar' && (
        <form onSubmit={handleSaveCalendar} className={card}>
          <h2 className="font-medium text-navy-900">Calendar &amp; scheduling</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-500">First day of the week</label>
              <select value={weekStartDay} onChange={(e) => setWeekStartDay(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2">
                {WEEKDAY_NAMES_FROM(0).map((_, i) => (
                  <option key={i} value={i}>
                    {WEEKDAY_FULL_NAMES[i]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Default visit duration</label>
              <select value={defaultDuration} onChange={(e) => setDefaultDuration(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2">
                {DURATION_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={savingCalendar} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
            {savingCalendar ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {category === 'providers' && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-navy-900">Providers (doctors)</h2>
              <p className="text-sm text-slate-500">Uncheck "Active" to hide a provider from new patients without deleting their history.</p>
            </div>
            <button
              onClick={() => {
                setShowAddProvider((s) => !s)
                setEditingProviderId(null)
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50"
            >
              {showAddProvider ? 'Cancel' : '+ Add provider'}
            </button>
          </div>
          {showAddProvider && <ProviderFields onSave={(payload) => handleSaveProvider(payload)} onCancel={() => setShowAddProvider(false)} />}
          <div className="divide-y divide-slate-100">
            {providers.length === 0 && !showAddProvider && <p className="py-2 text-sm text-slate-500">No providers yet — add one above.</p>}
            {providers.map((p) =>
              editingProviderId === p.id ? (
                <div key={p.id} className="py-3">
                  <ProviderFields provider={p} onSave={(payload) => handleSaveProvider(payload, p.id)} onCancel={() => setEditingProviderId(null)} />
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-navy-900">
                      {providerFullName(p)} {!p.active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{[p.specialty, p.email, p.phone].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button onClick={() => setEditingProviderId(p.id)} className="text-sm font-medium text-navy-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteProvider(p.id)} className="text-sm text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {category === 'procedures' && (
        <div className="space-y-4">
          <div className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Procedure categories</h2>
              <p className="text-sm text-slate-500">Group your procedures (e.g. Restorative, Surgery, Orthodontics).</p>
            </div>
            <form onSubmit={handleAddProcCategory} className="flex flex-wrap items-end gap-3">
              <input value={newProcCategory} onChange={(e) => setNewProcCategory(e.target.value)} placeholder="e.g. Restorative" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                + Add category
              </button>
            </form>
            <div className="divide-y divide-slate-100">
              {procCategories.map((c) => (
                <div key={c.id} className="py-2">
                  <input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && handleRenameProcCategory(c.id, e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-navy-900">Procedures</h2>
                <p className="text-sm text-slate-500">The treatments you offer, used for treatment plans and the price list.</p>
              </div>
              <button
                onClick={() => {
                  setShowAddProcedure((s) => !s)
                  setEditingProcedureId(null)
                }}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50"
              >
                {showAddProcedure ? 'Cancel' : '+ Add procedure'}
              </button>
            </div>
            {/* category filter buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setProcFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-medium ${procFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-700 hover:bg-slate-200'}`}
              >
                All
              </button>
              {procCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setProcFilter(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${procFilter === c.id ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-700 hover:bg-slate-200'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {showAddProcedure && (
              <ProcedureFields
                categories={procCategories}
                currency={settings.currency}
                defaultCategoryId={procFilter === 'all' ? null : procFilter}
                onSave={(payload) => handleSaveProcedure(payload)}
                onCancel={() => setShowAddProcedure(false)}
              />
            )}

            {(() => {
              const visible = procFilter === 'all' ? procedures : procedures.filter((p) => p.category_id === procFilter)
              if (visible.length === 0 && !showAddProcedure) {
                return <p className="py-2 text-sm text-slate-500">No procedures {procFilter === 'all' ? 'yet' : 'in this category'} — add one above.</p>
              }
              const groups = groupByCategory(visible, procCategories)
              return groups.map(({ categoryName, items }) => (
                <div key={categoryName} className="space-y-1">
                  {procFilter === 'all' && <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{categoryName}</p>}
                  <div className="divide-y divide-slate-100">
                    {items.map((p) =>
                      editingProcedureId === p.id ? (
                        <div key={p.id} className="py-3">
                          <ProcedureFields
                            procedure={p}
                            categories={procCategories}
                            currency={settings.currency}
                            onSave={(payload) => handleSaveProcedure(payload, p.id)}
                            onCancel={() => setEditingProcedureId(null)}
                          />
                        </div>
                      ) : (
                        <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <p className="font-medium text-navy-900">
                              {p.name} {p.code && <span className="text-xs font-normal text-slate-400">({p.code})</span>} {!p.active && <span className="text-xs font-normal text-slate-400">· inactive</span>}
                            </p>
                            <p className="text-xs text-slate-500">
                              {[p.default_duration_minutes ? `${p.default_duration_minutes} min` : null, p.default_price != null ? `${settings.currency} ${Number(p.default_price).toFixed(2)}` : null]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-3">
                            <button onClick={() => setEditingProcedureId(p.id)} className="text-sm font-medium text-navy-700 hover:underline">
                              Edit
                            </button>
                            <button onClick={() => handleDeleteProcedure(p.id)} className="text-sm text-red-600 hover:underline">
                              Delete
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {category === 'price-list' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Set the price of each procedure. Prices save automatically when you click away from the field.</p>
          {procedures.length === 0 && <div className={card}>No procedures yet. Add them in the Procedures tab first.</div>}
          {groupByCategory(procedures, procCategories).map(({ categoryName, items }) => (
            <div key={categoryName} className={card}>
              <h2 className="font-medium text-navy-900">{categoryName}</h2>
              <div className="divide-y divide-slate-100">
                {items.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <p className="text-sm text-navy-900">
                      {p.name} {p.code && <span className="text-xs text-slate-400">({p.code})</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{settings.currency}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={p.default_price ?? ''}
                        onBlur={(e) => (e.target.value || '') !== String(p.default_price ?? '') && handleUpdatePrice(p.id, e.target.value)}
                        placeholder="—"
                        className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {category === 'financial' && (
        <form onSubmit={handleSaveFinancial} className={card}>
          <div>
            <h2 className="font-medium text-navy-900">Financial &amp; defaults</h2>
            <p className="text-sm text-slate-500">Currency shown across payments, expenses and balances, plus default values for new patient files.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-500">Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EGP" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Default country (new patients)</label>
              <input value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value)} list="settings-country-options" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Default nationality (new patients)</label>
              <input value={defaultNationality} onChange={(e) => setDefaultNationality(e.target.value)} list="settings-country-options" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">“Owes a lot” threshold ({currency || 'EGP'})</label>
              <input type="number" min="0" step="1" value={bigDebtThreshold} onChange={(e) => setBigDebtThreshold(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">Patients owing this amount or more get an amber “owes a lot” tag on the Dashboard.</p>
            </div>
          </div>
          <datalist id="settings-country-options">
            {WORLD_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="font-medium text-navy-900">Payroll (HR)</h3>
            <p className="text-sm text-slate-500">Used by the HR payroll calculator.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-500">Profit-share to staff (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={profitSharePercent}
                onChange={(e) => setProfitSharePercent(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <p className="mt-0.5 text-[11px] text-slate-400">Share of net profit split equally among active staff as a bonus.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Salary period starts on day</label>
              <input type="number" min="1" max="28" value={salaryPeriodStartDay} onChange={(e) => setSalaryPeriodStartDay(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">e.g. 26 → attendance runs 26th to 25th.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Salary paid on day</label>
              <input type="number" min="1" max="28" value={salaryPayDay} onChange={(e) => setSalaryPayDay(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">No-leave period for new staff (months)</label>
              <input type="number" min="0" max="36" value={leaveEligibilityMonths} onChange={(e) => setLeaveEligibilityMonths(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">Employees can't take leave for this many months after their first day.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">After-midnight overtime ×</label>
              <input type="number" min="1" step="0.1" value={midnightMultiplier} onChange={(e) => setMidnightMultiplier(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">Overtime hours worked after 12 AM are paid at this multiple.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Early-arrival overtime cap (hours)</label>
              <input type="number" min="0" step="0.5" value={earlyOtCap} onChange={(e) => setEarlyOtCap(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">Max overtime credited for showing up before a fixed shift starts.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Round net salary to nearest</label>
              <select value={salaryRounding} onChange={(e) => setSalaryRounding(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value={0}>No rounding</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <p className="mt-0.5 text-[11px] text-slate-400">Each employee's final total is rounded (categories stay exact).</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Weekly day off</label>
              <select value={weeklyOffDay} onChange={(e) => setWeeklyOffDay(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[11px] text-slate-400">Working this day: every hour counts as overtime.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Late after (minutes)</label>
              <input type="number" min="0" max="120" value={lateGraceMinutes} onChange={(e) => setLateGraceMinutes(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <p className="mt-0.5 text-[11px] text-slate-400">Grace period — a “Late” flag shows only after this many minutes past shift start.</p>
            </div>
          </div>

          <button type="submit" disabled={savingFinancial} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
            {savingFinancial ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {category === 'financial' && (
        <div className={card}>
          <div>
            <h2 className="font-medium text-navy-900">Expense categories &amp; items</h2>
            <p className="text-sm text-slate-500">Categories shown when recording an expense; each category has its own list of items. Choosing a category on the expense form shows only that category's items.</p>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" checked={settings.expense_category_required} onChange={(e) => updateExpenseReq({ expense_category_required: e.target.checked })} />
              Category required
            </label>
            <label className="flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" checked={settings.expense_item_required} onChange={(e) => updateExpenseReq({ expense_item_required: e.target.checked })} />
              Item required
            </label>
            <label className="flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" checked={settings.expense_description_required} onChange={(e) => updateExpenseReq({ expense_description_required: e.target.checked })} />
              Description required
            </label>
          </div>

          <div className="space-y-3">
            {expenseCategories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
            {expenseCategories.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy-900">{c.name}</p>
                  <button onClick={() => handleDeleteExpenseCategory(c.id)} className="text-xs text-red-600 hover:underline">
                    Delete category
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {expenseItems.filter((i) => i.category_id === c.id).length === 0 && <span className="text-xs text-slate-400">No items yet.</span>}
                  {expenseItems
                    .filter((i) => i.category_id === c.id)
                    .map((i) => (
                      <span key={i.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-navy-800">
                        {i.name}
                        <button onClick={() => handleDeleteExpenseItem(i.id)} title="Remove item" className="rounded-full px-1 text-slate-400 hover:bg-red-100 hover:text-red-600">
                          ×
                        </button>
                      </span>
                    ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newExpenseItem[c.id] ?? ''}
                    onChange={(e) => setNewExpenseItem((m) => ({ ...m, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddExpenseItem(c.id)
                      }
                    }}
                    placeholder="Add an item to this category"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <button onClick={() => handleAddExpenseItem(c.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-slate-50">
                    + Item
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddExpenseCategory} className="flex gap-2 border-t border-slate-100 pt-3">
            <input
              value={newExpenseCategory}
              onChange={(e) => setNewExpenseCategory(e.target.value)}
              placeholder="New category (e.g. Lab fees)"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Add category
            </button>
          </form>
        </div>
      )}

      {category === 'team' && (
        <div className="space-y-4">
          <form onSubmit={handleAddMember} className={card}>
            <div>
              <h2 className="font-medium text-navy-900">Add a team member</h2>
              <p className="text-sm text-slate-500">Create a login for a staff member or provider. You set a temporary password; they can change it after they sign in.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="full_name" required placeholder="Full name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="email" type="email" required placeholder="Email (their login)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="password" required minLength={6} placeholder="Temporary password (min 6 chars)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select name="role" defaultValue="receptionist" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {TEAM_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select name="provider_id" defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
                <option value="">Link to a provider record (only for the Provider role)</option>
                {providers.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {providerFullName(pr)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={addingMember} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {addingMember ? 'Adding…' : 'Add member'}
            </button>
            {memberMsg && <p className={`text-sm ${memberMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{memberMsg}</p>}
            <p className="text-[11px] text-slate-400">
              A <span className="font-medium">Provider</span> account sees only their own appointments and the finances of patients whose main provider is them. Receptionist/Assistant have limited access; the Owner sees everything.
            </p>
          </form>

          <div className={card}>
            <h2 className="font-medium text-navy-900">Team members</h2>
            {team.length === 0 && <p className="text-sm text-slate-500">No members yet.</p>}
            <div className="divide-y divide-slate-100">
              {team.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">{m.full_name || m.email || 'Unnamed'}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                  </div>
                  <select
                    value={m.roles[0] ?? ''}
                    onChange={(e) => handleSetRole(m.id, e.target.value)}
                    disabled={m.id === session?.user.id}
                    title={m.id === session?.user.id ? "You can't change your own role" : 'Change role'}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="" disabled>
                      No role
                    </option>
                    {TEAM_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {category === 'backup' && (
        <div className={card}>
          <div>
            <h2 className="font-medium text-navy-900">Backup &amp; import</h2>
            <p className="text-sm text-slate-500">Export all patients to a CSV file, or bulk-import patients from a CSV built from the template.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExportCsv} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Export patients (CSV)
            </button>
            <button onClick={downloadPatientImportTemplate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Download import template
            </button>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              {importing ? 'Importing…' : 'Import patients (CSV)'}
              <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" disabled={importing} />
            </label>
          </div>
          {importSummary && <p className="text-sm text-slate-600">{importSummary}</p>}
        </div>
      )}
    </div>
  )
}

function groupByCategory(procedures: Procedure[], categories: ProcedureCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c.name]))
  const groups = new Map<string, Procedure[]>()
  for (const p of procedures) {
    const name = p.category_id ? byId.get(p.category_id) ?? 'Uncategorized' : 'Uncategorized'
    const list = groups.get(name) ?? []
    list.push(p)
    groups.set(name, list)
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([categoryName, items]) => ({ categoryName, items }))
}

function MandatoryFieldsDropdown({ selected, onChange }: { selected: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])
  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }
  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-navy-800 hover:bg-slate-50"
      >
        <span>{selected.length === 0 ? 'No fields selected' : `${selected.length} field${selected.length === 1 ? '' : 's'} selected`}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {REQUIRABLE_PATIENT_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-navy-800 hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ProviderFields({ provider, onSave, onCancel }: { provider?: Provider; onSave: (payload: Record<string, unknown>) => void; onCancel: () => void }) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    onSave({
      first_name: form.get('first_name'),
      last_name: form.get('last_name'),
      email: form.get('email') || null,
      phone: form.get('phone') || null,
      specialty: form.get('specialty') || null,
      license_number: form.get('license_number') || null,
      active: form.get('active') === 'on',
    })
  }
  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      <input name="first_name" required defaultValue={provider?.first_name ?? ''} placeholder="First name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input name="last_name" required defaultValue={provider?.last_name ?? ''} placeholder="Last name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <select name="specialty" defaultValue={provider?.specialty ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Specialty…</option>
        {DENTAL_SPECIALTIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input name="license_number" defaultValue={provider?.license_number ?? ''} placeholder="License / syndicate number" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input name="email" type="email" defaultValue={provider?.email ?? ''} placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input name="phone" defaultValue={provider?.phone ?? ''} placeholder="Phone" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-sm text-navy-800 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={provider?.active ?? true} />
        Active
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

function ProcedureFields({
  procedure,
  categories,
  currency,
  defaultCategoryId,
  onSave,
  onCancel,
}: {
  procedure?: Procedure
  categories: ProcedureCategory[]
  currency: string
  defaultCategoryId?: string | null
  onSave: (payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const duration = form.get('default_duration_minutes')
    const price = form.get('default_price')
    onSave({
      name: form.get('name'),
      code: form.get('code') || null,
      category_id: form.get('category_id') || null,
      description: form.get('description') || null,
      default_duration_minutes: duration ? Number(duration) : null,
      default_price: price ? Number(price) : null,
      active: form.get('active') === 'on',
    })
  }
  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      <input name="name" required defaultValue={procedure?.name ?? ''} placeholder="Procedure name (e.g. Composite filling)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
      <input name="code" defaultValue={procedure?.code ?? ''} placeholder="Code (optional, e.g. D2391)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <select name="category_id" defaultValue={procedure?.category_id ?? defaultCategoryId ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input name="default_duration_minutes" type="number" min="0" defaultValue={procedure?.default_duration_minutes ?? ''} placeholder="Default duration (min)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input name="default_price" type="number" step="0.01" min="0" defaultValue={procedure?.default_price ?? ''} placeholder={`Default price (${currency})`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <textarea name="description" defaultValue={procedure?.description ?? ''} placeholder="Description / clinical details" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm text-navy-800 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={procedure?.active ?? true} />
        Active
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  )
}
