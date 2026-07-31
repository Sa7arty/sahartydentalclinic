import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import {
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  LeaveType,
  LeaveStatus,
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_COLORS,
  PAID_ELIGIBLE_LEAVE_TYPES,
  DAY_OFF_LEAVE_TYPE,
  eachDateInclusive,
  inclusiveDayCount,
  employeeFullName,
  attendanceHours,
  overtimeForDay,
  isWeeklyOffDate,
  shiftDurationHours,
  leaveEligibilityDate,
  salaryPeriodFor,
  roundTo,
  daysUntil,
  EmployeeDeduction,
  DeductionKind,
  DeductionUnit,
  DeductionPayment,
  DEDUCTION_PAYMENT_LABELS,
  PayrollRun,
  Payslip as StoredPayslip,
  EMPLOYEE_POSITIONS,
  formatMoney,
  AppSettings,
} from '../types'
import { formatDate, toYmd } from '../lib/dates'
import { exportPayslipPdf, exportStaffSummaryPdf } from '../lib/pdf'

type HrTab = 'employees' | 'attendance' | 'leave' | 'deductions' | 'payroll' | 'summary'

const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'

export default function HR() {
  const { isDentist } = useAuth()
  const { settings } = useSettings()
  const [tab, setTab] = useState<HrTab>('employees')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('first_name')
    setEmployees((data as Employee[]) ?? [])
    setLoading(false)
  }

  if (!isDentist) return <p className="text-sm text-slate-500">Human resources is available to dentists only.</p>

  const tabs: { key: HrTab; label: string }[] = [
    { key: 'employees', label: 'Employees' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'leave', label: 'Leave' },
    { key: 'deductions', label: 'Deductions & loans' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'summary', label: 'Summary' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy-900">Human resources</h1>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'border-gold-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : tab === 'employees' ? (
        <EmployeesTab employees={employees} settings={settings} onChanged={loadEmployees} />
      ) : tab === 'attendance' ? (
        <AttendanceTab employees={employees} settings={settings} />
      ) : tab === 'leave' ? (
        <LeaveTab employees={employees} settings={settings} />
      ) : tab === 'deductions' ? (
        <DeductionsTab employees={employees} settings={settings} />
      ) : tab === 'summary' ? (
        <SummaryTab employees={employees} settings={settings} />
      ) : (
        <PayrollTab employees={employees} settings={settings} onChanged={loadEmployees} />
      )}
    </div>
  )
}

// ============================================================
// Employees tab
// ============================================================
function EmployeesTab({ employees, settings, onChanged }: { employees: Employee[]; settings: AppSettings; onChanged: () => void }) {
  const { session } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleSave(payload: Record<string, unknown>, file: File | null, id?: string) {
    let employeeId = id
    if (id) {
      const { error } = await supabase.from('employees').update({ ...payload, updated_by: session?.user.id, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return alert(error.message)
    } else {
      const { data, error } = await supabase.from('employees').insert({ ...payload, created_by: session?.user.id }).select('id').single()
      if (error) return alert(error.message)
      employeeId = data.id
    }
    if (file && employeeId) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${employeeId}/national-id.${ext}`
      const { error: upErr } = await supabase.storage.from('employee-docs').upload(path, file, { upsert: true })
      if (upErr) alert(`Employee saved, but the ID file failed to upload: ${upErr.message}`)
      else await supabase.from('employees').update({ national_id_file_path: path }).eq('id', employeeId)
    }
    setShowAdd(false)
    setEditingId(null)
    onChanged()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this employee and all their attendance records? This cannot be undone.')) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) alert(error.message)
    else onChanged()
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-navy-900">Staff</h2>
          <p className="text-sm text-slate-500">Receptionists, dental assistants and other team members (providers/doctors are managed under Settings).</p>
        </div>
        <button
          onClick={() => {
            setShowAdd((s) => !s)
            setEditingId(null)
          }}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50"
        >
          {showAdd ? 'Cancel' : '+ Add employee'}
        </button>
      </div>

      {showAdd && <EmployeeForm settings={settings} onSave={(p, f) => handleSave(p, f)} onCancel={() => setShowAdd(false)} />}

      <div className="divide-y divide-slate-100">
        {employees.length === 0 && !showAdd && <p className="py-2 text-sm text-slate-500">No employees yet — add one above.</p>}
        {employees.map((e) =>
          editingId === e.id ? (
            <div key={e.id} className="py-3">
              <EmployeeForm employee={e} settings={settings} onSave={(p, f) => handleSave(p, f, e.id)} onCancel={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={e.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-navy-900">
                  {employeeFullName(e)} {!e.active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}
                  <ExpiryBadge label="Last day" date={e.last_working_day} />
                  <ExpiryBadge label="ID" date={e.national_id_expiry} />
                </p>
                <p className="text-xs text-slate-500">
                  {[
                    e.position,
                    `${formatMoney(Number(e.base_salary), settings)}/mo`,
                    e.shift_start && e.shift_end ? `${e.shift_start.slice(0, 5)}–${e.shift_end.slice(0, 5)}` : 'flexible',
                    e.hire_date ? `since ${formatDate(e.hire_date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {e.national_id_file_path && <ViewIdButton path={e.national_id_file_path} />}
                <button onClick={() => setEditingId(e.id)} className="text-sm font-medium text-navy-700 hover:underline">
                  Edit
                </button>
                <button onClick={() => handleDelete(e.id)} className="text-sm text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** Amber/red pill when a contract or ID is expiring soon (≤45 days) or already expired. */
function ExpiryBadge({ label, date }: { label: string; date: string | null }) {
  const days = daysUntil(date)
  if (days === null || days > 45) return null
  const expired = days < 0
  return (
    <span
      title={`${label} ${expired ? 'expired' : 'expires'} ${formatDate(date)}`}
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
    >
      {label} {expired ? 'expired' : `${days}d`}
    </span>
  )
}

function ViewIdButton({ path }: { path: string }) {
  async function open() {
    const { data, error } = await supabase.storage.from('employee-docs').createSignedUrl(path, 60)
    if (error || !data) return alert('Could not open the file.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  return (
    <button onClick={open} className="text-sm text-navy-700 hover:underline">
      View ID
    </button>
  )
}

function EmployeeForm({
  employee,
  settings,
  onSave,
  onCancel,
}: {
  employee?: Employee
  settings: AppSettings
  onSave: (payload: Record<string, unknown>, file: File | null) => void
  onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [hoursMode, setHoursMode] = useState<'shift' | 'flexible'>(employee && !employee.shift_start ? 'flexible' : 'shift')
  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    // Fixed shift → derive standard hours from the shift window and count early-arrival overtime.
    // Flexible → only a daily-hours number; check-in/out times don't earn early overtime.
    const isShift = hoursMode === 'shift'
    const shiftStart = isShift ? (f.get('shift_start') as string) || null : null
    const shiftEnd = isShift ? (f.get('shift_end') as string) || null : null
    const standard = isShift
      ? shiftDurationHours(shiftStart, shiftEnd) ?? employee?.standard_daily_hours ?? 8
      : Number(f.get('flex_hours')) || 8
    onSave(
      {
        first_name: f.get('first_name'),
        middle_name: f.get('middle_name') || null,
        last_name: f.get('last_name'),
        position: f.get('position') || null,
        date_of_birth: f.get('date_of_birth') || null,
        hire_date: f.get('hire_date') || null,
        last_working_day: f.get('last_working_day') || null,
        national_id: f.get('national_id') || null,
        national_id_expiry: f.get('national_id_expiry') || null,
        phone: f.get('phone') || null,
        email: f.get('email') || null,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        base_salary: Number(f.get('base_salary')) || 0,
        overtime_hourly_rate: Number(f.get('overtime_hourly_rate')) || 0,
        standard_daily_hours: standard,
        expected_work_days: Number(f.get('expected_work_days')) || 26,
        annual_leave_days: Number(f.get('annual_leave_days')) || 0,
        active: f.get('active') === 'on',
      },
      file,
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-slate-500">First name</label>
        <input name="first_name" required defaultValue={employee?.first_name ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Middle name</label>
        <input name="middle_name" defaultValue={employee?.middle_name ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Last name</label>
        <input name="last_name" required defaultValue={employee?.last_name ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Position</label>
        <input name="position" list="position-options" defaultValue={employee?.position ?? ''} className={input} />
        <datalist id="position-options">
          {EMPLOYEE_POSITIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Date of birth</label>
        <input name="date_of_birth" type="date" defaultValue={employee?.date_of_birth ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">First day on the job</label>
        <input name="hire_date" type="date" defaultValue={employee?.hire_date ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">National ID number</label>
        <input name="national_id" defaultValue={employee?.national_id ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">National ID / permit expiry</label>
        <input name="national_id_expiry" type="date" defaultValue={employee?.national_id_expiry ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Last day on the job</label>
        <input name="last_working_day" type="date" defaultValue={employee?.last_working_day ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Phone</label>
        <input name="phone" defaultValue={employee?.phone ?? ''} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Email</label>
        <input name="email" type="email" defaultValue={employee?.email ?? ''} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-slate-500">National ID copy (image or PDF)</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {employee?.national_id_file_path && <span className="ml-2 text-xs text-slate-400">A file is already on record; choosing a new one replaces it.</span>}
      </div>

      <div className="sm:col-span-2 mt-1 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
        <p className="text-sm font-medium text-navy-900 sm:col-span-2">Salary &amp; hours</p>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Monthly base salary ({settings.currency})</label>
          <input name="base_salary" type="number" step="0.01" min="0" defaultValue={employee?.base_salary ?? 0} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Overtime rate (per extra hour, {settings.currency})</label>
          <input name="overtime_hourly_rate" type="number" step="0.01" min="0" defaultValue={employee?.overtime_hourly_rate ?? 0} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-slate-500">Working hours</label>
          <div className="mb-2 flex gap-4 text-sm text-navy-800">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="hours_mode" checked={hoursMode === 'shift'} onChange={() => setHoursMode('shift')} />
              Fixed shift
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="hours_mode" checked={hoursMode === 'flexible'} onChange={() => setHoursMode('flexible')} />
              Flexible hours
            </label>
          </div>
          {hoursMode === 'shift' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Shift start</label>
                <input name="shift_start" type="time" defaultValue={employee?.shift_start?.slice(0, 5) ?? ''} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Shift end</label>
                <input name="shift_end" type="time" defaultValue={employee?.shift_end?.slice(0, 5) ?? ''} className={input} />
              </div>
              <p className="text-[11px] text-slate-400 sm:col-span-2">
                Shift length = standard hours. Coming in before the shift (up to the early-overtime cap) and staying past it both count as overtime; an AM end time is treated as the next day.
              </p>
            </div>
          ) : (
            <div>
              <input name="flex_hours" type="number" step="0.5" min="0" defaultValue={employee?.standard_daily_hours ?? 8} placeholder="Hours per day" className={input} />
              <p className="mt-0.5 text-[11px] text-slate-400">They can check in/out anytime; only total hours matter. Overtime = hours worked beyond this per day (no early-arrival bonus).</p>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Expected work days / month</label>
          <input name="expected_work_days" type="number" min="1" max="31" defaultValue={employee?.expected_work_days ?? 26} className={input} />
          <p className="mt-0.5 text-[11px] text-slate-400">Base ÷ this = one day's pay, used to pro-rate for absences.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Paid leave days / year</label>
          <input name="annual_leave_days" type="number" min="0" max="365" defaultValue={employee?.annual_leave_days ?? 21} className={input} />
          <p className="mt-0.5 text-[11px] text-slate-400">Leave up to this is paid; beyond it, days are deducted from salary.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-navy-800 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={employee?.active ?? true} />
        Active
      </label>

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
          Save employee
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Attendance tab
// ============================================================
function AttendanceTab({ employees, settings }: { employees: Employee[]; settings: AppSettings }) {
  const { session } = useAuth()
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [month, setMonth] = useState(() => toYmd(new Date()).slice(0, 7)) // yyyy-mm
  const [rows, setRows] = useState<EmployeeAttendance[]>([])
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<EmployeeAttendance | null>(null)

  const employee = employees.find((e) => e.id === employeeId)
  const payMonth = useMemo(() => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15), [month])
  const period = useMemo(() => salaryPeriodFor(payMonth, settings.salary_period_start_day), [payMonth, settings.salary_period_start_day])

  useEffect(() => {
    if (employeeId) loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, month])

  async function loadRows() {
    const [{ data }, { data: lv }] = await Promise.all([
      supabase.from('employee_attendance').select('*').eq('employee_id', employeeId).gte('work_date', toYmd(period.start)).lte('work_date', toYmd(period.end)).order('work_date'),
      supabase.from('employee_leave').select('*').eq('employee_id', employeeId).eq('status', 'approved'),
    ])
    setRows((data as EmployeeAttendance[]) ?? [])
    const s = new Set<string>()
    for (const l of (lv as EmployeeLeave[]) ?? []) for (const d of eachDateInclusive(l.start_date, l.end_date)) s.add(d)
    setLeaveDates(s)
  }

  const isLate = (r: EmployeeAttendance): boolean => (employee ? isLateRow(employee, r, settings) : false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('employee_attendance').upsert(
      {
        employee_id: employeeId,
        work_date: f.get('work_date'),
        check_in: f.get('check_in') || null,
        check_out: f.get('check_out') || null,
        note: f.get('note') || null,
        created_by: session?.user.id,
      },
      { onConflict: 'employee_id,work_date' },
    )
    if (error) return alert(error.message)
    e.currentTarget.reset()
    setEditing(null)
    loadRows()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('employee_attendance').delete().eq('id', id)
    if (error) alert(error.message)
    else loadRows()
  }

  const rules = employee ? otRules(employee, settings) : { standardHours: 8 }
  const totalHours = rows.reduce((s, r) => s + attendanceHours(r), 0)
  const overtimeHours = rows.reduce((s, r) => {
    const o = overtimeForDay(r, rules)
    return s + o.otBeforeMidnight + o.otAfterMidnight
  }, 0)
  const lateDays = rows.filter(isLate).length
  // No-shows: working days already passed with no attendance and no approved leave.
  const attendedSet = new Set(rows.map((r) => r.work_date))
  const todayYmd = toYmd(new Date())
  const absences = eachDateInclusive(toYmd(period.start), toYmd(period.end)).filter(
    (d) => d <= todayYmd && !isWeeklyOffDate(d, settings.weekly_off_day) && !attendedSet.has(d) && !leaveDates.has(d),
  ).length

  return (
    <div className={card}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeFullName(e)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Salary month (paid on the {settings.salary_pay_day}th)</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Attendance period: <span className="font-medium text-navy-800">{formatDate(period.start)} → {formatDate(period.end)}</span>
      </p>

      {!employee ? (
        <p className="text-sm text-slate-500">Add an employee first.</p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Date</label>
              <input name="work_date" type="date" required defaultValue={editing?.work_date ?? toYmd(new Date())} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Check in</label>
              <input name="check_in" type="time" defaultValue={editing?.check_in?.slice(0, 5) ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Check out</label>
              <input name="check_out" type="time" defaultValue={editing?.check_out?.slice(0, 5) ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800">
                {editing ? 'Update day' : 'Add day'}
              </button>
            </div>
            <input name="note" placeholder="Note (optional)" defaultValue={editing?.note ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-4" />
          </form>

          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
            <Stat label="Days attended" value={String(rows.length)} />
            <Stat label="Total hours" value={totalHours.toFixed(1)} />
            <Stat label="Overtime hours" value={overtimeHours.toFixed(1)} />
            <Stat label="Late days" value={String(lateDays)} />
            <Stat label="Absences (so far)" value={String(absences)} />
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">OT</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-slate-500">
                      No attendance recorded for this period.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const h = attendanceHours(r)
                  const o = overtimeForDay(r, rules)
                  const ot = o.otBeforeMidnight + o.otAfterMidnight
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{new Date(`${r.work_date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' })}</td>
                      <td className="px-3 py-2">
                        {formatDate(r.work_date)}
                        {isWeeklyOffDate(r.work_date, settings.weekly_off_day) && (
                          <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">day off</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.check_in?.slice(0, 5) ?? '—'}
                        {isLate(r) && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Late</span>}
                      </td>
                      <td className="px-3 py-2">{r.check_out?.slice(0, 5) ?? '—'}</td>
                      <td className="px-3 py-2">{h.toFixed(1)}</td>
                      <td className="px-3 py-2">{ot > 0 ? ot.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setEditing(r)} className="mr-3 text-xs font-medium text-navy-700 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="text-xs text-red-600 hover:underline">
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-navy-900">{value}</p>
    </div>
  )
}

// ============================================================
// Leave accounting (shared by Leave tab + Payroll)
// ============================================================
/**
 * For one employee's approved leave, decide per calendar date whether it is 'paid'
 * (within the annual allowance) or 'unpaid' (allowance exhausted, or an unpaid-type leave).
 * Days are counted chronologically within each calendar year; the first `annualLeaveDays`
 * allowance-eligible days are paid, the rest are unpaid.
 */
/** Overtime rules for an employee (fixed shift vs flexible hours) using the current settings. */
function otRules(emp: Employee, settings: AppSettings) {
  return {
    standardHours: Number(emp.standard_daily_hours),
    shiftStart: emp.shift_start,
    shiftEnd: emp.shift_end,
    earlyOvertimeCapHours: settings.early_overtime_cap_hours,
    weeklyOffDay: settings.weekly_off_day,
  }
}

type LeaveDayInfo = { status: 'paid' | 'unpaid'; kind: 'leave' | 'day_off' }

function computeLeave(leaves: EmployeeLeave[], annualLeaveDays: number) {
  const approved = leaves.filter((l) => l.status === 'approved')
  // Per date, keep the most-favourable category when records overlap: day_off > allowance-eligible > unpaid.
  const rank = (t: EmployeeLeave['leave_type']) => (t === DAY_OFF_LEAVE_TYPE ? 2 : PAID_ELIGIBLE_LEAVE_TYPES.includes(t) ? 1 : 0)
  const byDate = new Map<string, number>()
  for (const l of approved) {
    for (const d of eachDateInclusive(l.start_date, l.end_date)) byDate.set(d, Math.max(byDate.get(d) ?? 0, rank(l.leave_type)))
  }
  const usedByYear: Record<string, number> = {} // allowance-eligible days used per calendar year
  const statusByDate = new Map<string, LeaveDayInfo>()
  for (const d of [...byDate.keys()].sort()) {
    const r = byDate.get(d)!
    if (r === 2) {
      statusByDate.set(d, { status: 'paid', kind: 'day_off' }) // granted day off — paid, no allowance
    } else if (r === 1) {
      const yr = d.slice(0, 4)
      usedByYear[yr] = (usedByYear[yr] ?? 0) + 1
      statusByDate.set(d, { status: usedByYear[yr] <= annualLeaveDays ? 'paid' : 'unpaid', kind: 'leave' })
    } else {
      statusByDate.set(d, { status: 'unpaid', kind: 'leave' })
    }
  }
  return { statusByDate, usedByYear }
}

/** A day is "late" only for a fixed-shift employee who checked in more than the grace period after shift start. */
function isLateRow(emp: Employee, r: Pick<EmployeeAttendance, 'check_in'>, settings: AppSettings): boolean {
  if (!emp.shift_start || !r.check_in) return false
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return toMin(r.check_in) > toMin(emp.shift_start) + settings.late_grace_minutes
}

/**
 * Compute one employee's payslip for a salary month. Shared by the Payroll tab and the Summary tab
 * so both always agree. `attendance` may contain rows for any employee across both periods — it is
 * filtered here. Base pay is pro-rated by attendance; overtime and profit-share are earned in the
 * previous period (bonuses lag one month); deductions/loan installments due this month are recovered.
 */
function buildPayslip(
  emp: Employee,
  attendance: EmployeeAttendance[],
  allLeave: EmployeeLeave[],
  allDeductions: EmployeeDeduction[],
  perEmployee: number,
  settings: AppSettings,
  bounds: { curStart: string; curEnd: string; prevStart: string; prevEnd: string; payDateYmd: string },
): Payslip {
  const { curStart, curEnd, prevStart, prevEnd, payDateYmd } = bounds
  const mult = Number(settings.overtime_midnight_multiplier)
  const rules = otRules(emp, settings)
  const curRows = attendance.filter((a) => a.employee_id === emp.id && a.work_date >= curStart && a.work_date <= curEnd)
  const prevRows = attendance.filter((a) => a.employee_id === emp.id && a.work_date >= prevStart && a.work_date <= prevEnd)
  // Fridays are the weekly day off — attending doesn't count as a work day (all its hours are overtime).
  const attendedDays = curRows.filter((r) => !isWeeklyOffDate(r.work_date, settings.weekly_off_day)).length
  const attendedSet = new Set(curRows.map((r) => r.work_date))

  const { statusByDate } = computeLeave(allLeave.filter((l) => l.employee_id === emp.id), emp.annual_leave_days)
  let paidLeaveDays = 0
  let unpaidLeaveDays = 0
  for (const [date, info] of statusByDate) {
    if (date < curStart || date > curEnd || attendedSet.has(date)) continue
    if (info.status === 'paid') paidLeaveDays++
    else unpaidLeaveDays++
  }

  const perDayValue = emp.expected_work_days > 0 ? Number(emp.base_salary) / emp.expected_work_days : 0
  const paidDays = Math.min(attendedDays + paidLeaveDays, emp.expected_work_days)
  const regularPay = paidDays * perDayValue
  const deductionDays = Math.max(0, emp.expected_work_days - paidDays)

  let otHoursPrev = 0
  let otMidnightPrev = 0
  let overtimePayPrev = 0
  for (const r of prevRows) {
    const o = overtimeForDay(r, rules)
    otHoursPrev += o.otBeforeMidnight + o.otAfterMidnight
    otMidnightPrev += o.otAfterMidnight
    overtimePayPrev += o.otBeforeMidnight * Number(emp.overtime_hourly_rate) + o.otAfterMidnight * Number(emp.overtime_hourly_rate) * mult
  }
  const profitSharePrev = perEmployee
  const gross = regularPay + overtimePayPrev + profitSharePrev

  const deductions = allDeductions
    .filter((d) => d.employee_id === emp.id && (!d.start_date || d.start_date <= payDateYmd))
    .map((d) => ({
      id: d.id,
      description: d.description || (d.kind === 'loan' ? 'Loan repayment' : 'Deduction'),
      amount: Math.min(Number(d.per_installment), Number(d.total_amount) - Number(d.amount_settled)),
      kind: d.kind,
    }))
    .filter((d) => d.amount > 0)
  const deductionsTotal = deductions.reduce((s, d) => s + d.amount, 0)

  const afterDeductions = gross - deductionsTotal
  const total = roundTo(afterDeductions, settings.salary_rounding)
  const roundingAdj = total - afterDeductions

  return {
    employee: emp,
    attendedDays,
    paidLeaveDays,
    unpaidLeaveDays,
    deductionDays,
    perDayValue,
    regularPay,
    overtimeHoursPrev: otHoursPrev,
    overtimeMidnightHoursPrev: otMidnightPrev,
    overtimePayPrev,
    profitSharePrev,
    gross,
    deductions,
    deductionsTotal,
    roundingAdj,
    total,
  }
}

// ============================================================
// Leave tab
// ============================================================
function LeaveTab({ employees, settings }: { employees: Employee[]; settings: AppSettings }) {
  const { session } = useAuth()
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [year, setYear] = useState(new Date().getFullYear())
  const [leaves, setLeaves] = useState<EmployeeLeave[]>([])
  const [applyAll, setApplyAll] = useState(false)

  const employee = employees.find((e) => e.id === employeeId)
  const eligibleFrom = employee ? leaveEligibilityDate(employee.hire_date, settings.leave_eligibility_months) : null

  useEffect(() => {
    if (employeeId) loadLeaves()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  async function loadLeaves() {
    const { data } = await supabase.from('employee_leave').select('*').eq('employee_id', employeeId).order('start_date', { ascending: false })
    setLeaves((data as EmployeeLeave[]) ?? [])
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const start = f.get('start_date') as string
    const end = (f.get('end_date') as string) || start
    const type = f.get('leave_type') as EmployeeLeave['leave_type']
    if (end < start) return alert('End date cannot be before the start date.')

    // Probation: no leave (except an employer-granted day off) before the eligibility date.
    if (type !== DAY_OFF_LEAVE_TYPE && !applyAll) {
      const from = leaveEligibilityDate(employee?.hire_date ?? null, settings.leave_eligibility_months)
      if (from && start < from) {
        return alert(`This employee can't take leave until ${formatDate(from)} (first ${settings.leave_eligibility_months} months on the job). You can still grant a paid day off.`)
      }
    }

    const targets = applyAll ? employees.filter((e2) => e2.active).map((e2) => e2.id) : [employeeId]
    const rows = targets.map((id) => ({
      employee_id: id,
      start_date: start,
      end_date: end,
      leave_type: type,
      status: 'approved',
      note: f.get('note') || null,
      created_by: session?.user.id,
    }))
    const { error } = await supabase.from('employee_leave').insert(rows)
    if (error) return alert(error.message)
    e.currentTarget.reset()
    setApplyAll(false)
    loadLeaves()
  }

  async function setStatus(id: string, status: LeaveStatus) {
    const { error } = await supabase.from('employee_leave').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else loadLeaves()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this leave record?')) return
    const { error } = await supabase.from('employee_leave').delete().eq('id', id)
    if (error) alert(error.message)
    else loadLeaves()
  }

  const allowance = employee?.annual_leave_days ?? 0
  const { usedByYear } = useMemo(() => computeLeave(leaves, allowance), [leaves, allowance])
  const usedThisYear = usedByYear[String(year)] ?? 0
  const paidUsed = Math.min(usedThisYear, allowance)
  const remaining = Math.max(0, allowance - usedThisYear)
  const overAllowance = Math.max(0, usedThisYear - allowance)

  const yearLeaves = leaves.filter((l) => Number(l.start_date.slice(0, 4)) === year || Number(l.end_date.slice(0, 4)) === year)

  return (
    <div className={card}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeFullName(e)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Year</label>
          <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {!employee ? (
        <p className="text-sm text-slate-500">Add an employee first.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {employee.hire_date ? (
              <>
                First day: <span className="font-medium text-navy-800">{formatDate(employee.hire_date)}</span> · Eligible for leave from{' '}
                <span className="font-medium text-navy-800">{eligibleFrom ? formatDate(eligibleFrom) : '—'}</span> (first {settings.leave_eligibility_months} months)
              </>
            ) : (
              <span className="text-amber-600">No hire date set — add it on the employee to enforce the leave-eligibility period.</span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <Stat label="Allowance / year" value={String(allowance)} />
            <Stat label="Paid leave used" value={String(paidUsed)} />
            <Stat label="Remaining (paid)" value={String(remaining)} />
            <Stat label="Over allowance (unpaid)" value={String(overAllowance)} />
          </div>

          <form onSubmit={handleAdd} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">From</label>
              <input name="start_date" type="date" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">To</label>
              <input name="end_date" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Type</label>
              <select name="leave_type" defaultValue="annual" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800">
                Add leave
              </button>
            </div>
            <input name="note" placeholder="Note (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-4" />
            <label className="flex items-center gap-2 text-xs text-navy-800 sm:col-span-4">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              Apply to all active employees (e.g. a clinic-wide day off or holiday)
            </label>
          </form>
          <p className="text-xs text-slate-400">
            “Paid day off (granted)” is always paid and never uses the allowance. “Unpaid” leave, or any leave beyond the yearly allowance, is deducted from that month's salary in Payroll.
          </p>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {yearLeaves.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-slate-500">
                      No leave recorded for {year}.
                    </td>
                  </tr>
                )}
                {yearLeaves.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {formatDate(l.start_date)}
                      {l.end_date !== l.start_date && <> → {formatDate(l.end_date)}</>}
                      {l.note && <span className="block text-xs text-slate-400">{l.note}</span>}
                    </td>
                    <td className="px-3 py-2">{inclusiveDayCount(l.start_date, l.end_date)}</td>
                    <td className="px-3 py-2">{LEAVE_TYPE_LABELS[l.leave_type]}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEAVE_STATUS_COLORS[l.status]}`}>{LEAVE_STATUS_LABELS[l.status]}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.status !== 'approved' && (
                        <button onClick={() => setStatus(l.id, 'approved')} className="mr-3 text-xs font-medium text-green-700 hover:underline">
                          Approve
                        </button>
                      )}
                      {l.status !== 'rejected' && (
                        <button onClick={() => setStatus(l.id, 'rejected')} className="mr-3 text-xs text-slate-500 hover:underline">
                          Reject
                        </button>
                      )}
                      <button onClick={() => handleDelete(l.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Deductions & loans tab
// ============================================================
function DeductionsTab({ employees, settings }: { employees: Employee[]; settings: AppSettings }) {
  const { session } = useAuth()
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [items, setItems] = useState<EmployeeDeduction[]>([])
  const [payments, setPayments] = useState<DeductionPayment[]>([])
  const [kind, setKind] = useState<DeductionKind>('deduction')
  const [unit, setUnit] = useState<DeductionUnit>('amount')
  const [recordExpense, setRecordExpense] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)

  const employee = employees.find((e) => e.id === employeeId)
  const money = (n: number) => formatMoney(n, settings)
  // Worth of one working day for the selected employee (base salary ÷ expected work-days per month).
  const dayValue = employee && employee.expected_work_days > 0 ? Number(employee.base_salary) / employee.expected_work_days : 0

  useEffect(() => {
    if (employeeId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  async function load() {
    const { data } = await supabase.from('employee_deductions').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false })
    const list = (data as EmployeeDeduction[]) ?? []
    setItems(list)
    if (list.length) {
      const { data: pays } = await supabase.from('deduction_payments').select('*').in('deduction_id', list.map((d) => d.id)).order('paid_on', { ascending: false })
      setPayments((pays as DeductionPayment[]) ?? [])
    } else {
      setPayments([])
    }
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const useDays = kind === 'deduction' && unit === 'work_days'
    let total: number
    let per: number
    let workDays: number | null = null
    if (useDays) {
      workDays = Number(f.get('work_days'))
      if (!(workDays > 0)) return alert('Enter the number of working days to deduct (greater than 0).')
      if (!(dayValue > 0)) return alert('This employee has no base salary / expected work-days set, so a day value cannot be calculated.')
      total = workDays * dayValue
      per = total // a work-day penalty is taken from the next salary in one go
    } else {
      total = Number(f.get('total_amount'))
      per = Number(f.get('per_installment'))
      if (!(total > 0) || !(per > 0)) return alert('Enter a total amount and a monthly installment (both greater than 0).')
    }
    const startDate = (f.get('start_date') as string) || toYmd(new Date())
    const { error } = await supabase.from('employee_deductions').insert({
      employee_id: employeeId,
      kind,
      description: f.get('description') || null,
      start_date: startDate,
      total_amount: total,
      per_installment: per,
      deduction_unit: useDays ? 'work_days' : 'amount',
      work_days: workDays,
      created_by: session?.user.id,
    })
    if (error) return alert(error.message)
    // A loan pays cash to the employee now — record it as an expense so Finances stays accurate.
    if (kind === 'loan' && recordExpense) {
      const occurred = new Date(`${startDate}T12:00:00`)
      await supabase.from('expenses').insert({
        description: `Loan to ${employee ? employeeFullName(employee) : 'employee'}${f.get('description') ? ` — ${f.get('description')}` : ''}`,
        category: 'Staff loan',
        amount: total,
        expense_type: 'general',
        occurred_at: occurred.toISOString(),
        expense_date: startDate,
        entered_by: session?.user.id,
      })
    }
    e.currentTarget.reset()
    load()
  }

  // Record a cash payment against a loan/deduction (partial or full settlement). Reduces the
  // remaining balance (shortening future installments). For a LOAN, the money comes back to the
  // clinic → record it as income. For a deduction (penalty) it just stops the salary deductions.
  async function recordPayment(d: EmployeeDeduction, amount: number, paidOn: string) {
    const remaining = Number(d.total_amount) - Number(d.amount_settled)
    if (!(amount > 0)) return
    const capped = Math.min(amount, remaining)
    const newSettled = Number(d.amount_settled) + capped
    const fullyPaid = newSettled >= Number(d.total_amount) - 0.001
    const paymentKind = fullyPaid ? 'full_settlement' : 'partial_settlement'
    const { error } = await supabase.from('deduction_payments').insert({
      deduction_id: d.id,
      amount: capped,
      kind: paymentKind,
      paid_on: paidOn,
      created_by: session?.user.id,
    })
    if (error) return alert(error.message)
    await supabase.from('employee_deductions').update({ amount_settled: newSettled, active: !fullyPaid }).eq('id', d.id)
    if (d.kind === 'loan') {
      await supabase.from('misc_income').insert({
        description: `Loan repayment — ${employee ? employeeFullName(employee) : 'employee'}${d.description ? ` (${d.description})` : ''}`,
        category: 'Staff loan',
        amount: capped,
        occurred_at: new Date(`${paidOn}T12:00:00`).toISOString(),
        income_date: paidOn,
        entered_by: session?.user.id,
      })
    }
    setPayingId(null)
    load()
  }

  async function handlePartialPayment(e: FormEvent<HTMLFormElement>, d: EmployeeDeduction) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amount = Number(f.get('amount'))
    const paidOn = (f.get('paid_on') as string) || toYmd(new Date())
    if (!(amount > 0)) return alert('Enter an amount greater than 0.')
    await recordPayment(d, amount, paidOn)
  }

  async function handleSettleFull(d: EmployeeDeduction) {
    const remaining = Number(d.total_amount) - Number(d.amount_settled)
    if (!confirm(`Settle the remaining ${formatMoney(remaining, settings)} in full?${d.kind === 'loan' ? ' It will be recorded as income.' : ''}`)) return
    await recordPayment(d, remaining, toYmd(new Date()))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this record and its payment history entirely?')) return
    const { error } = await supabase.from('employee_deductions').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  const monthsLeft = (d: EmployeeDeduction) => Math.ceil((Number(d.total_amount) - Number(d.amount_settled)) / Number(d.per_installment))

  return (
    <div className={card}>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {employeeFullName(e)}
            </option>
          ))}
        </select>
      </div>

      {!employee ? (
        <p className="text-sm text-slate-500">Add an employee first.</p>
      ) : (
        <>
          <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex gap-4 text-sm text-navy-800">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={kind === 'deduction'} onChange={() => setKind('deduction')} /> Deduction (penalty / recovery)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={kind === 'loan'} onChange={() => setKind('loan')} /> Loan (money given now)
              </label>
            </div>

            {kind === 'deduction' && (
              <div className="flex flex-wrap gap-4 text-sm text-navy-800">
                <span className="text-xs text-slate-400">Deduct by:</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={unit === 'amount'} onChange={() => setUnit('amount')} /> Amount
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={unit === 'work_days'} onChange={() => setUnit('work_days')} /> Working days
                </label>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <input name="description" placeholder="Reason / description" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">{kind === 'loan' ? 'Date of loan' : 'Date of deduction'}</label>
                <input name="start_date" type="date" defaultValue={toYmd(new Date())} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              {kind === 'deduction' && unit === 'work_days' ? (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">Number of working days</label>
                  <input name="work_days" type="number" step="0.5" min="0" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <p className="mt-1 text-[11px] text-slate-500">
                    One working day = {money(dayValue)} (base ÷ {employee.expected_work_days} work-days). Taken from the next salary in full.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Total amount ({settings.currency})</label>
                    <input name="total_amount" type="number" step="0.01" min="0" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Deduct per month ({settings.currency})</label>
                    <input name="per_installment" type="number" step="0.01" min="0" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}
            </div>
            {kind === 'loan' && (
              <label className="flex items-center gap-2 text-xs text-navy-800">
                <input type="checkbox" checked={recordExpense} onChange={(e) => setRecordExpense(e.target.checked)} />
                Record the loan payout as an expense in Finances now
              </label>
            )}
            <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Add {kind === 'loan' ? 'loan' : 'deduction'}
            </button>
            <p className="text-[11px] text-slate-400">
              Deducting starts from the first salary on/after the date, taking the monthly installment from net pay until settled. Large amounts spread over several months automatically.
            </p>
          </form>

          {items.length === 0 && <p className="text-sm text-slate-500">No deductions or loans for this employee.</p>}
          <div className="space-y-3">
            {items.map((d) => {
              const remaining = Number(d.total_amount) - Number(d.amount_settled)
              const history = payments.filter((p) => p.deduction_id === d.id)
              return (
                <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-navy-900">
                        {d.kind === 'loan' ? 'Loan' : 'Deduction'}
                        {d.deduction_unit === 'work_days' && d.work_days ? ` · ${d.work_days} work day${d.work_days === 1 ? '' : 's'}` : ''}
                        {d.description ? ` · ${d.description}` : ''}{' '}
                        {d.active ? (
                          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Active</span>
                        ) : (
                          <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Settled</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {d.start_date ? `${formatDate(d.start_date)} · ` : ''}
                        {money(Number(d.amount_settled))} of {money(Number(d.total_amount))} settled · {money(Number(d.per_installment))}/mo
                        {d.active && remaining > 0 && <> · {money(remaining)} left (~{monthsLeft(d)} mo)</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {d.active && (
                        <>
                          <button onClick={() => setPayingId(payingId === d.id ? null : d.id)} className="text-xs font-medium text-navy-700 hover:underline">
                            Record payment
                          </button>
                          <button onClick={() => handleSettleFull(d)} className="text-xs font-medium text-green-700 hover:underline">
                            Settle in full
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDelete(d.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>

                  {payingId === d.id && (
                    <form onSubmit={(e) => handlePartialPayment(e, d)} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-400">Amount ({settings.currency})</label>
                        <input name="amount" type="number" step="0.01" min="0" max={remaining} required defaultValue={Number(d.per_installment)} className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-400">Date</label>
                        <input name="paid_on" type="date" defaultValue={toYmd(new Date())} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                      </div>
                      <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                        Record
                      </button>
                      <p className="w-full text-[11px] text-slate-400">A partial payment reduces the balance and shortens the remaining months.{d.kind === 'loan' ? ' Recorded as income.' : ''}</p>
                    </form>
                  )}

                  {history.length > 0 && (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Payment history</p>
                      <div className="space-y-0.5">
                        {history.map((p) => (
                          <div key={p.id} className="flex justify-between text-xs text-slate-600">
                            <span>
                              {formatDate(p.paid_on)} · {DEDUCTION_PAYMENT_LABELS[p.kind]}
                            </span>
                            <span className="font-medium">{money(Number(p.amount))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Payroll tab
// ============================================================
type Payslip = {
  employee: Employee
  attendedDays: number
  paidLeaveDays: number
  unpaidLeaveDays: number
  deductionDays: number
  perDayValue: number
  regularPay: number
  overtimeHoursPrev: number
  overtimeMidnightHoursPrev: number
  overtimePayPrev: number
  profitSharePrev: number
  gross: number
  deductions: { id: string; description: string; amount: number; kind: DeductionKind }[]
  deductionsTotal: number
  roundingAdj: number
  total: number
}

function PayrollTab({ employees, settings, onChanged }: { employees: Employee[]; settings: AppSettings; onChanged: () => void }) {
  const { session } = useAuth()
  const [month, setMonth] = useState(() => toYmd(new Date()).slice(0, 7))
  const [slips, setSlips] = useState<Payslip[]>([])
  const [poolInfo, setPoolInfo] = useState({ netPrev: 0, pool: 0, perEmployee: 0 })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [storedSlips, setStoredSlips] = useState<StoredPayslip[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [activeDeductions, setActiveDeductions] = useState<EmployeeDeduction[]>([])

  const payMonth = useMemo(() => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15), [month])
  const curPeriod = useMemo(() => salaryPeriodFor(payMonth, settings.salary_period_start_day), [payMonth, settings.salary_period_start_day])
  const prevPayMonth = useMemo(() => new Date(payMonth.getFullYear(), payMonth.getMonth() - 1, 15), [payMonth])
  const prevPeriod = useMemo(() => salaryPeriodFor(prevPayMonth, settings.salary_period_start_day), [prevPayMonth, settings.salary_period_start_day])
  const payDate = new Date(payMonth.getFullYear(), payMonth.getMonth(), settings.salary_pay_day)

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])

  useEffect(() => {
    compute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, employees])

  async function compute() {
    setLoading(true)
    const curStart = toYmd(curPeriod.start)
    const curEnd = toYmd(curPeriod.end)
    const prevStart = toYmd(prevPeriod.start)
    const prevEnd = toYmd(prevPeriod.end)

    // Attendance for both periods (all employees at once)
    const { data: att } = await supabase
      .from('employee_attendance')
      .select('*')
      .gte('work_date', prevStart)
      .lte('work_date', curEnd)
    const attendance = (att as EmployeeAttendance[]) ?? []

    // All approved leave (needed to compute the running annual allowance correctly).
    const { data: lv } = await supabase.from('employee_leave').select('*').eq('status', 'approved')
    const allLeave = (lv as EmployeeLeave[]) ?? []

    // Active deductions / loans (installment recovered from net pay each month).
    const { data: ded } = await supabase.from('employee_deductions').select('*').eq('active', true)
    const allDeductions = (ded as EmployeeDeduction[]) ?? []
    setActiveDeductions(allDeductions)

    // Is this month already finalized? If so, show the locked snapshot instead of a live calc.
    const payMonthYmd = `${payMonth.getFullYear()}-${String(payMonth.getMonth() + 1).padStart(2, '0')}-01`
    const { data: runRow } = await supabase.from('payroll_runs').select('*').eq('pay_month', payMonthYmd).maybeSingle()
    setRun((runRow as PayrollRun) ?? null)
    if (runRow) {
      const { data: ps } = await supabase.from('payslips').select('*').eq('run_id', (runRow as PayrollRun).id).order('employee_name')
      setStoredSlips((ps as StoredPayslip[]) ?? [])
    } else {
      setStoredSlips([])
    }
    supabase.from('payroll_runs').select('*').order('pay_month', { ascending: false }).then(({ data }) => setRuns((data as PayrollRun[]) ?? []))

    // Net profit for the PREVIOUS period drives the profit-share bonus.
    const prevStartIso = new Date(`${prevStart}T00:00:00`).toISOString()
    const prevEndIso = new Date(`${prevEnd}T23:59:59`).toISOString()
    const [{ data: pays }, { data: exps }, { data: misc }] = await Promise.all([
      supabase.from('ledger_entries').select('amount').eq('entry_type', 'payment').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
      supabase.from('expenses').select('amount').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
      supabase.from('misc_income').select('amount').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
    ])
    const incomePrev = (pays ?? []).reduce((s, r: any) => s + Number(r.amount), 0) + (misc ?? []).reduce((s, r: any) => s + Number(r.amount), 0)
    const expensePrev = (exps ?? []).reduce((s, r: any) => s + Number(r.amount), 0)
    const netPrev = incomePrev - expensePrev
    const pool = Math.max(0, netPrev) * (settings.profit_share_percent / 100)
    const perEmployee = activeEmployees.length > 0 ? pool / activeEmployees.length : 0
    setPoolInfo({ netPrev, pool, perEmployee })

    const bounds = { curStart, curEnd, prevStart, prevEnd, payDateYmd: toYmd(payDate) }
    const result: Payslip[] = activeEmployees.map((emp) => buildPayslip(emp, attendance, allLeave, allDeductions, perEmployee, settings, bounds))
    setSlips(result)
    setLoading(false)
  }

  async function handleFinalize() {
    if (run) return
    if (slips.length === 0) return alert('No employees to pay.')
    if (!confirm(`Finalize payroll for ${payMonth.toLocaleString('en', { month: 'long', year: 'numeric' })}? This locks the payslips, advances any loan/deduction installments, and records the total as an expense.`)) return
    setFinalizing(true)
    const payMonthYmd = `${payMonth.getFullYear()}-${String(payMonth.getMonth() + 1).padStart(2, '0')}-01`
    const totalAmount = slips.reduce((s, p) => s + p.total, 0)

    // 1) Record the payroll total as an expense in Finances.
    const { data: exp, error: expErr } = await supabase
      .from('expenses')
      .insert({
        description: `Payroll — ${payMonth.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
        category: 'Salaries',
        amount: totalAmount,
        expense_type: 'general',
        occurred_at: payDate.toISOString(),
        expense_date: payDate.toISOString().slice(0, 10),
        entered_by: session?.user.id,
      })
      .select('id')
      .single()
    if (expErr) {
      setFinalizing(false)
      return alert(expErr.message)
    }

    // 2) Create the run.
    const { data: runRow, error: runErr } = await supabase
      .from('payroll_runs')
      .insert({
        pay_month: payMonthYmd,
        period_start: toYmd(curPeriod.start),
        period_end: toYmd(curPeriod.end),
        pay_date: toYmd(payDate),
        total_amount: totalAmount,
        expense_id: exp.id,
        finalized_by: session?.user.id,
      })
      .select('*')
      .single()
    if (runErr) {
      setFinalizing(false)
      return alert(runErr.message)
    }

    // 3) Snapshot payslips.
    const rows = slips.map((p) => ({
      run_id: runRow.id,
      employee_id: p.employee.id,
      employee_name: employeeFullName(p.employee),
      position: p.employee.position,
      base_salary: Number(p.employee.base_salary),
      per_day_value: p.perDayValue,
      expected_days: p.employee.expected_work_days,
      attended_days: p.attendedDays,
      paid_leave_days: p.paidLeaveDays,
      unpaid_days: p.deductionDays,
      regular_pay: p.regularPay,
      overtime_hours: p.overtimeHoursPrev,
      overtime_midnight_hours: p.overtimeMidnightHoursPrev,
      overtime_pay: p.overtimePayPrev,
      profit_share: p.profitSharePrev,
      deductions_total: p.deductionsTotal,
      rounding_adjustment: p.roundingAdj,
      net_pay: p.total,
      breakdown: { deductions: p.deductions.map((d) => ({ description: d.description, amount: d.amount })) },
    }))
    await supabase.from('payslips').insert(rows)

    // 4) Advance each deduction's settled amount by what was taken this month.
    for (const p of slips) {
      for (const d of p.deductions) {
        const src = activeDeductions.find((x) => x.id === d.id)
        if (!src) continue
        const settled = Number(src.amount_settled) + d.amount
        await supabase
          .from('employee_deductions')
          .update({ amount_settled: settled, active: settled < Number(src.total_amount) })
          .eq('id', d.id)
        // Log the installment in the loan/deduction's payment history.
        await supabase.from('deduction_payments').insert({
          deduction_id: d.id,
          amount: d.amount,
          kind: 'salary_deduction',
          paid_on: toYmd(payDate),
          created_by: session?.user.id,
        })
      }
    }

    setFinalizing(false)
    onChanged()
    compute()
  }

  function reprintStored(p: StoredPayslip) {
    exportPayslipPdf({
      employeeName: p.employee_name,
      position: p.position,
      currency: settings.currency,
      periodLabel: run ? `${formatDate(run.period_start)} → ${formatDate(run.period_end)}` : '',
      bonusPeriodLabel: `${formatDate(prevPeriod.start)} → ${formatDate(prevPeriod.end)}`,
      payDateLabel: run ? formatDate(run.pay_date) : '',
      baseSalary: Number(p.base_salary),
      perDayValue: Number(p.per_day_value),
      expectedDays: p.expected_days,
      attendedDays: p.attended_days,
      paidLeaveDays: p.paid_leave_days,
      unpaidDays: p.unpaid_days,
      regularPay: Number(p.regular_pay),
      overtimeHours: Number(p.overtime_hours),
      overtimeRate: 0, // rate not stored; overtime pay is shown directly
      overtimePay: Number(p.overtime_pay),
      profitShare: Number(p.profit_share),
      deductionsTotal: Number(p.deductions_total),
      roundingAdj: Number(p.rounding_adjustment),
      total: Number(p.net_pay),
    })
  }

  const money = (n: number) => formatMoney(n, settings)
  const grandTotal = slips.reduce((s, p) => s + p.total, 0)

  function downloadPayslip(p: Payslip) {
    exportPayslipPdf({
      employeeName: employeeFullName(p.employee),
      position: p.employee.position,
      currency: settings.currency,
      periodLabel: `${formatDate(curPeriod.start)} → ${formatDate(curPeriod.end)}`,
      bonusPeriodLabel: `${formatDate(prevPeriod.start)} → ${formatDate(prevPeriod.end)}`,
      payDateLabel: formatDate(payDate),
      baseSalary: Number(p.employee.base_salary),
      perDayValue: p.perDayValue,
      expectedDays: p.employee.expected_work_days,
      attendedDays: p.attendedDays,
      paidLeaveDays: p.paidLeaveDays,
      unpaidDays: p.deductionDays,
      regularPay: p.regularPay,
      overtimeHours: p.overtimeHoursPrev,
      overtimeRate: Number(p.employee.overtime_hourly_rate),
      overtimePay: p.overtimePayPrev,
      profitShare: p.profitSharePrev,
      deductionsTotal: p.deductionsTotal,
      roundingAdj: p.roundingAdj,
      total: p.total,
    })
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Salary month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Pay date: <span className="font-medium text-navy-800">{formatDate(payDate)}</span></p>
            <p>Attendance: {formatDate(curPeriod.start)} → {formatDate(curPeriod.end)}</p>
            <p>Bonuses earned: {formatDate(prevPeriod.start)} → {formatDate(prevPeriod.end)}</p>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-navy-800">How this is calculated</p>
          <p>Base is pro-rated by attendance (base ÷ expected work-days × paid days). Approved leave within the yearly allowance counts as paid; unpaid or over-allowance leave and plain absences are deducted. Overtime and the profit-share bonus are earned in the previous period and paid this month (bonuses always lag one month).</p>
          <p className="mt-1">
            Profit-share pool = {settings.profit_share_percent}% × net profit of {formatDate(prevPeriod.start)}–{formatDate(prevPeriod.end)} ({money(poolInfo.netPrev)}) ={' '}
            <span className="font-medium text-navy-800">{money(poolInfo.pool)}</span>, split equally = {money(poolInfo.perEmployee)} each.
          </p>
        </div>
      </div>

      {/* Finalize / paid banner */}
      {run ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
          <span className="font-medium text-green-800">✓ Paid on {formatDate(run.pay_date)} · Total {money(Number(run.total_amount))} · recorded in Finances</span>
          <span className="text-xs text-green-700">This month is locked. Payslips below are the saved copies.</span>
        </div>
      ) : (
        !loading &&
        slips.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm text-slate-600">
              Total to pay: <span className="font-semibold text-navy-900">{money(grandTotal)}</span>
            </p>
            <button onClick={handleFinalize} disabled={finalizing} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400 disabled:opacity-50">
              {finalizing ? 'Finalizing…' : 'Finalize & pay'}
            </button>
          </div>
        )
      )}

      {loading ? (
        <p className="text-slate-500">Calculating…</p>
      ) : run ? (
        /* Locked snapshot */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Base pay</th>
                <th className="px-3 py-2">Overtime</th>
                <th className="px-3 py-2">Profit share</th>
                <th className="px-3 py-2">Deductions</th>
                <th className="px-3 py-2">Net pay</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {storedSlips.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-navy-900">{p.employee_name}</td>
                  <td className="px-3 py-2">{money(Number(p.regular_pay))}</td>
                  <td className="px-3 py-2">{money(Number(p.overtime_pay))}</td>
                  <td className="px-3 py-2">{money(Number(p.profit_share))}</td>
                  <td className="px-3 py-2">{Number(p.deductions_total) > 0 ? `−${money(Number(p.deductions_total))}` : '—'}</td>
                  <td className="px-3 py-2 font-semibold text-navy-900">{money(Number(p.net_pay))}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => reprintStored(p)} className="text-xs font-medium text-navy-700 hover:underline">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-3 py-2 font-semibold text-navy-900" colSpan={5}>
                  Total payroll ({storedSlips.length} employees)
                </td>
                <td className="px-3 py-2 font-semibold text-navy-900">{money(Number(run.total_amount))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : slips.length === 0 ? (
        <p className="text-sm text-slate-500">No active employees to pay.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Base pay</th>
                <th className="px-3 py-2">Overtime</th>
                <th className="px-3 py-2">Profit share</th>
                <th className="px-3 py-2">Deductions</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {slips.map((p) => (
                <Fragment key={p.employee.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-navy-900">{employeeFullName(p.employee)}</td>
                    <td className="px-3 py-2">
                      {p.attendedDays}/{p.employee.expected_work_days}
                      {p.paidLeaveDays > 0 && <span className="ml-1 text-xs text-green-600">+{p.paidLeaveDays}L</span>}
                    </td>
                    <td className="px-3 py-2">{money(p.regularPay)}</td>
                    <td className="px-3 py-2">{money(p.overtimePayPrev)}</td>
                    <td className="px-3 py-2">{money(p.profitSharePrev)}</td>
                    <td className="px-3 py-2">{p.deductionsTotal > 0 ? `−${money(p.deductionsTotal)}` : '—'}</td>
                    <td className="px-3 py-2 font-semibold text-navy-900">{money(p.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setExpanded(expanded === p.employee.id ? null : p.employee.id)} className="mr-3 text-xs font-medium text-navy-700 hover:underline">
                        {expanded === p.employee.id ? 'Hide' : 'Breakdown'}
                      </button>
                      <button onClick={() => downloadPayslip(p)} className="text-xs font-medium text-navy-700 hover:underline">
                        PDF
                      </button>
                    </td>
                  </tr>
                  {expanded === p.employee.id && (
                    <tr className="border-t border-slate-100 bg-slate-50 text-xs text-slate-600">
                      <td colSpan={8} className="px-3 py-3">
                        <ul className="space-y-1">
                          <li>Base salary: {money(Number(p.employee.base_salary))} · one day = {money(p.perDayValue)} ({p.employee.expected_work_days} expected days)</li>
                          <li>
                            Attended {p.attendedDays} day(s){p.paidLeaveDays > 0 && <> + {p.paidLeaveDays} paid-leave day(s)</>} → base pay {money(p.regularPay)}
                          </li>
                          {p.deductionDays > 0 && (
                            <li className="text-red-600">
                              Unpaid / absent {p.deductionDays} day(s){p.unpaidLeaveDays > 0 && <> (incl. {p.unpaidLeaveDays} over-allowance leave)</>} → −{money(p.deductionDays * p.perDayValue)}
                            </li>
                          )}
                          <li>
                            Overtime (previous period): {p.overtimeHoursPrev.toFixed(1)} hrs × {money(Number(p.employee.overtime_hourly_rate))}
                            {p.overtimeMidnightHoursPrev > 0 && <> · incl. {p.overtimeMidnightHoursPrev.toFixed(1)} hr after midnight ×{settings.overtime_midnight_multiplier}</>} = {money(p.overtimePayPrev)}
                          </li>
                          <li>Profit share (previous period): {money(p.profitSharePrev)}</li>
                          {p.deductions.map((d) => (
                            <li key={d.id} className="text-red-600">
                              {d.kind === 'loan' ? 'Loan installment' : 'Deduction'}: {d.description} → −{money(d.amount)}
                            </li>
                          ))}
                          {Math.abs(p.roundingAdj) >= 0.005 && (
                            <li>Rounding to nearest {settings.salary_rounding}: {p.roundingAdj > 0 ? '+' : '−'}{money(Math.abs(p.roundingAdj))}</li>
                          )}
                          <li className="font-medium text-navy-800">Net pay: {money(p.total)}</li>
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-3 py-2 font-semibold text-navy-900" colSpan={6}>
                  Total payroll ({slips.length} employees)
                </td>
                <td className="px-3 py-2 font-semibold text-navy-900">{money(grandTotal)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Payslip history */}
      {runs.length > 0 && (
        <div className={card}>
          <h2 className="font-medium text-navy-900">Past payrolls</h2>
          <div className="divide-y divide-slate-100">
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => setMonth(r.pay_month.slice(0, 7))}
                className={`flex w-full items-center justify-between py-2 text-left text-sm hover:bg-slate-50 ${r.id === run?.id ? 'font-medium text-navy-900' : 'text-slate-600'}`}
              >
                <span>{new Date(`${r.pay_month}T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' })}</span>
                <span>{formatDate(r.pay_date)} · {money(Number(r.total_amount))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Summary tab — all staff, one month at a glance (attendance + pay)
// ============================================================
type SummaryRow = {
  emp: Employee
  present: number
  hours: number
  overtime: number
  late: number
  paidLeave: number
  absent: number
  netPay: number
}

function SummaryTab({ employees, settings }: { employees: Employee[]; settings: AppSettings }) {
  const [month, setMonth] = useState(() => toYmd(new Date()).slice(0, 7))
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(false)

  const payMonth = useMemo(() => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15), [month])
  const curPeriod = useMemo(() => salaryPeriodFor(payMonth, settings.salary_period_start_day), [payMonth, settings.salary_period_start_day])
  const prevPayMonth = useMemo(() => new Date(payMonth.getFullYear(), payMonth.getMonth() - 1, 15), [payMonth])
  const prevPeriod = useMemo(() => salaryPeriodFor(prevPayMonth, settings.salary_period_start_day), [prevPayMonth, settings.salary_period_start_day])
  const payDate = new Date(payMonth.getFullYear(), payMonth.getMonth(), settings.salary_pay_day)
  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])
  const monthLabel = payMonth.toLocaleString('en', { month: 'long', year: 'numeric' })
  const money = (n: number) => formatMoney(n, settings)

  useEffect(() => {
    compute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, employees])

  async function compute() {
    setLoading(true)
    const curStart = toYmd(curPeriod.start)
    const curEnd = toYmd(curPeriod.end)
    const prevStart = toYmd(prevPeriod.start)
    const prevEnd = toYmd(prevPeriod.end)

    const [{ data: att }, { data: lv }, { data: ded }] = await Promise.all([
      supabase.from('employee_attendance').select('*').gte('work_date', prevStart).lte('work_date', curEnd),
      supabase.from('employee_leave').select('*').eq('status', 'approved'),
      supabase.from('employee_deductions').select('*').eq('active', true),
    ])
    const attendance = (att as EmployeeAttendance[]) ?? []
    const allLeave = (lv as EmployeeLeave[]) ?? []
    const allDeductions = (ded as EmployeeDeduction[]) ?? []

    // Profit-share pool comes from the previous period's net profit (bonuses lag one month).
    const prevStartIso = new Date(`${prevStart}T00:00:00`).toISOString()
    const prevEndIso = new Date(`${prevEnd}T23:59:59`).toISOString()
    const [{ data: pays }, { data: exps }, { data: misc }] = await Promise.all([
      supabase.from('ledger_entries').select('amount').eq('entry_type', 'payment').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
      supabase.from('expenses').select('amount').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
      supabase.from('misc_income').select('amount').gte('occurred_at', prevStartIso).lte('occurred_at', prevEndIso),
    ])
    const netPrev =
      (pays ?? []).reduce((s, r: any) => s + Number(r.amount), 0) +
      (misc ?? []).reduce((s, r: any) => s + Number(r.amount), 0) -
      (exps ?? []).reduce((s, r: any) => s + Number(r.amount), 0)
    const pool = Math.max(0, netPrev) * (settings.profit_share_percent / 100)
    const perEmployee = activeEmployees.length > 0 ? pool / activeEmployees.length : 0

    const bounds = { curStart, curEnd, prevStart, prevEnd, payDateYmd: toYmd(payDate) }
    const todayYmd = toYmd(new Date())

    const result: SummaryRow[] = activeEmployees.map((emp) => {
      const curRows = attendance.filter((a) => a.employee_id === emp.id && a.work_date >= curStart && a.work_date <= curEnd)
      const rules = otRules(emp, settings)
      const hours = curRows.reduce((s, r) => s + attendanceHours(r), 0)
      const overtime = curRows.reduce((s, r) => {
        const o = overtimeForDay(r, rules)
        return s + o.otBeforeMidnight + o.otAfterMidnight
      }, 0)
      const present = curRows.filter((r) => !isWeeklyOffDate(r.work_date, settings.weekly_off_day)).length
      const late = curRows.filter((r) => isLateRow(emp, r, settings)).length

      const { statusByDate } = computeLeave(allLeave.filter((l) => l.employee_id === emp.id), emp.annual_leave_days)
      const attendedSet = new Set(curRows.map((r) => r.work_date))
      const leaveDates = new Set<string>()
      let paidLeave = 0
      for (const [date, info] of statusByDate) {
        if (date < curStart || date > curEnd) continue
        leaveDates.add(date)
        if (!attendedSet.has(date) && info.status === 'paid') paidLeave++
      }
      // Absences so far: elapsed working days with no attendance and no approved leave.
      const absent = eachDateInclusive(curStart, curEnd).filter(
        (d) => d <= todayYmd && !isWeeklyOffDate(d, settings.weekly_off_day) && !attendedSet.has(d) && !leaveDates.has(d),
      ).length

      const slip = buildPayslip(emp, attendance, allLeave, allDeductions, perEmployee, settings, bounds)
      return { emp, present, hours, overtime, late, paidLeave, absent, netPay: slip.total }
    })
    setRows(result)
    setLoading(false)
  }

  const totals = rows.reduce(
    (t, r) => ({
      present: t.present + r.present,
      hours: t.hours + r.hours,
      overtime: t.overtime + r.overtime,
      late: t.late + r.late,
      paidLeave: t.paidLeave + r.paidLeave,
      absent: t.absent + r.absent,
      netPay: t.netPay + r.netPay,
    }),
    { present: 0, hours: 0, overtime: 0, late: 0, paidLeave: 0, absent: 0, netPay: 0 },
  )

  return (
    <div className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Salary month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-500">
            Attendance: {formatDate(curPeriod.start)} → {formatDate(curPeriod.end)}
          </p>
        </div>
        <button
          onClick={() =>
            exportStaffSummaryPdf(
              monthLabel,
              settings.currency,
              rows.map((r) => ({ name: employeeFullName(r.emp), present: r.present, hours: r.hours, overtime: r.overtime, late: r.late, paidLeave: r.paidLeave, absent: r.absent, netPay: r.netPay })),
            )
          }
          disabled={rows.length === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50 disabled:opacity-40"
        >
          Export (PDF)
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No active employees.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Present</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Overtime</th>
                <th className="px-3 py-2 text-right">Late</th>
                <th className="px-3 py-2 text-right">Paid leave</th>
                <th className="px-3 py-2 text-right">Absent</th>
                <th className="px-3 py-2 text-right">Net pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emp.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-navy-900">
                    {employeeFullName(r.emp)}
                    {r.emp.position && <span className="ml-1 text-xs text-slate-400">· {r.emp.position}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.present}/{r.emp.expected_work_days}
                  </td>
                  <td className="px-3 py-2 text-right">{r.hours.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{r.overtime > 0 ? r.overtime.toFixed(1) : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.late > 0 ? <span className="font-medium text-red-600">{r.late}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.paidLeave > 0 ? <span className="text-green-600">{r.paidLeave}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.absent > 0 ? <span className="font-medium text-red-600">{r.absent}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-navy-900">{money(r.netPay)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-navy-900">
                <td className="px-3 py-2">Totals ({rows.length})</td>
                <td className="px-3 py-2 text-right">{totals.present}</td>
                <td className="px-3 py-2 text-right">{totals.hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{totals.overtime.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{totals.late}</td>
                <td className="px-3 py-2 text-right">{totals.paidLeave}</td>
                <td className="px-3 py-2 text-right">{totals.absent}</td>
                <td className="px-3 py-2 text-right">{money(totals.netPay)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Present / hours / overtime / late / absent reflect the current salary month. Net pay is the projected pay for this month (base pro-rated by attendance, plus the previous
        period's overtime and profit-share, less any deductions) — the same figure the Payroll tab produces, and it becomes final once that month is finalized there.
      </p>
    </div>
  )
}
