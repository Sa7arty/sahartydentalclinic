export type AppRole = 'dentist' | 'front_desk'

export interface Location {
  id: string
  name: string
  address: string | null
}

export type Gender = 'male' | 'female'

export const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'] as const

export interface Provider {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  specialty: string | null
  license_number: string | null
  active: boolean
}

export function providerFullName(p: Pick<Provider, 'first_name' | 'last_name'>): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

export interface PatientGroup {
  id: string
  name: string
  active: boolean
}

export interface PatientCondition {
  id: string
  patient_id: string
  condition: string
  note: string | null
  created_at: string
}

export interface PatientMedication {
  id: string
  patient_id: string
  name: string
  created_at: string
}

export interface PatientAllergy {
  id: string
  patient_id: string
  name: string
  note: string | null
  created_at: string
}

/** Common allergies relevant to dental care — datalist suggestions (free text still allowed). */
export const COMMON_ALLERGIES: string[] = [
  'Penicillin',
  'Amoxicillin',
  'Local anesthetic (Lidocaine)',
  'Articaine',
  'Latex',
  'Aspirin / NSAIDs',
  'Ibuprofen',
  'Codeine',
  'Sulfa drugs',
  'Iodine / contrast dye',
  'Metronidazole',
  'Erythromycin',
  'Eugenol',
  'Nickel / metals',
  'Acrylic / methacrylate',
  'Chlorhexidine',
  'Food allergy',
]

export interface MedicalConditionOption {
  id: string
  name: string
  active: boolean
}

export interface ProcedureCategory {
  id: string
  name: string
  active: boolean
}

export interface Procedure {
  id: string
  category_id: string | null
  category?: Pick<ProcedureCategory, 'name'> | null
  name: string
  code: string | null
  description: string | null
  default_duration_minutes: number | null
  default_price: number | null
  active: boolean
}

interface AuditProfile {
  full_name: string | null
  email: string | null
}

export interface Patient {
  id: string
  file_number: string | null
  title: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  gender: Gender | null
  date_of_birth: string | null
  marital_status: string | null
  nationality: string | null
  national_id: string | null
  occupation: string | null
  phone: string | null
  phone_secondary: string | null
  email: string | null
  country: string | null
  city: string | null
  district: string | null
  address: string | null
  provider_id: string | null
  provider?: Pick<Provider, 'first_name' | 'last_name'> | null
  group_id: string | null
  group?: Pick<PatientGroup, 'name'> | null
  is_smoker: boolean
  medical_history: string | null
  notes: string | null
  primary_location_id: string | null
  created_at: string
  created_by: string | null
  created_by_profile?: AuditProfile | null
  updated_at: string | null
  updated_by: string | null
  updated_by_profile?: AuditProfile | null
}

export interface AppSettings {
  id_digit_length: number
  auto_generate_file_number: boolean
  required_fields: string[]
  week_start_day: number
  default_visit_duration_minutes: number
  elderly_age_threshold: number
  currency: string
  default_country: string | null
  default_nationality: string | null
  profit_share_percent: number
  salary_period_start_day: number
  salary_pay_day: number
  leave_eligibility_months: number
  overtime_midnight_multiplier: number
  early_overtime_cap_hours: number
  salary_rounding: number
  weekly_off_day: number
  late_grace_minutes: number
  rows_per_page: number
  expense_category_required: boolean
  expense_item_required: boolean
  expense_description_required: boolean
  big_debt_threshold: number
}

/** Round a value to the nearest `increment` (0 or 1 = no rounding). */
export function roundTo(value: number, increment: number): number {
  if (!increment || increment <= 1) return value
  return Math.round(value / increment) * increment
}

/** Major medical conditions relevant to dental care — searchable dropdown source. */
export const MEDICAL_CONDITIONS: string[] = [
  'Diabetes (Type 1)',
  'Diabetes (Type 2)',
  'Hypertension (high blood pressure)',
  'Heart disease',
  'Heart valve problems / murmur',
  'Pacemaker',
  'Stroke history',
  'Asthma',
  'COPD / chronic lung disease',
  'Bleeding disorder',
  'Blood thinners (anticoagulants)',
  'Anemia',
  'Kidney disease',
  'Liver disease / Hepatitis',
  'Thyroid disorder',
  'Epilepsy / seizures',
  'Osteoporosis',
  'Bisphosphonate treatment',
  'Cancer / chemotherapy',
  'Radiation therapy (head/neck)',
  'HIV / immunocompromised',
  'Pregnancy',
  'Breastfeeding',
  'Latex allergy',
  'Penicillin allergy',
  'Local anesthetic allergy',
  'Aspirin / NSAID allergy',
  'Rheumatic fever history',
  'Joint replacement / prosthesis',
  'Acid reflux (GERD)',
  'Psychiatric condition',
  'Smoker',
]

export function currencyLabel(settings: Pick<AppSettings, 'currency'>): string {
  return settings.currency || 'EGP'
}

export function formatMoney(amount: number, settings: Pick<AppSettings, 'currency'>): string {
  return `${currencyLabel(settings)} ${amount.toFixed(2)}`
}

export const DENTAL_SPECIALTIES: string[] = [
  'General Dentistry',
  'Orthodontics',
  'Endodontics',
  'Periodontics',
  'Prosthodontics',
  'Oral and Maxillofacial Surgery',
  'Pediatric Dentistry',
  'Oral Pathology',
  'Oral and Maxillofacial Radiology',
  'Dental Public Health',
  'Cosmetic Dentistry',
  'Implantology',
  'Restorative Dentistry',
  'Geriatric Dentistry',
  'Special Needs Dentistry',
]

/** Common patient titles offered (as suggestions) on the patient form; free text is allowed. */
export const PATIENT_TITLES: string[] = ['Dr', 'Prof', 'Eng', 'Mr', 'Mrs', 'Ms', 'Miss']

/** Fields a dentist can mark mandatory on the new-patient form. */
export const REQUIRABLE_PATIENT_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Title (Dr / Mr / …)' },
  { key: 'first_name', label: 'First name' },
  { key: 'middle_name', label: 'Middle name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'gender', label: 'Gender' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'marital_status', label: 'Marital status' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'national_id', label: 'National ID (NID)' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone_secondary', label: 'Phone (alternate)' },
  { key: 'email', label: 'Email' },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District / area' },
  { key: 'address', label: 'Address' },
  { key: 'provider_id', label: 'Provider' },
  { key: 'group_id', label: 'Group' },
  { key: 'notes', label: 'Notes' },
]

export function patientFullName(p: Pick<Patient, 'first_name' | 'middle_name' | 'last_name'> & { title?: string | null }): string {
  return [p.title, p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
}

/**
 * Which currently-mandatory fields are empty on this patient file. Recomputed from
 * `requiredFields` each time, so a file's "incomplete" mark updates the moment the
 * dentist changes which fields are mandatory in Settings.
 */
export function missingRequiredPatientFields(p: Partial<Patient>, requiredFields: string[]): string[] {
  const labelOf = (k: string) => REQUIRABLE_PATIENT_FIELDS.find((f) => f.key === k)?.label ?? k
  return requiredFields
    .filter((k) => {
      const v = (p as Record<string, unknown>)[k]
      return v === null || v === undefined || String(v).trim() === ''
    })
    .map(labelOf)
}

/** Age is always derived from date_of_birth + today, never stored. */
export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--
  return age
}

export function hasMedicalCondition(p: Pick<Patient, 'medical_history'>): boolean {
  return !!p.medical_history && p.medical_history.trim().length > 0
}

export function isElderly(p: Pick<Patient, 'date_of_birth'>, elderlyAgeThreshold: number): boolean {
  const age = calculateAge(p.date_of_birth)
  return age !== null && age >= elderlyAgeThreshold
}

/** e.g. "1985-03-12 (41y)" — combined display, same idea as file-number-under-name. */
/** dd/mm/yyyy for a 'yyyy-mm-dd' string (kept here to avoid a dates.ts import cycle). */
function ymdToDmy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return d && m && y ? `${d}/${m}/${y}` : ymd
}

export function formatDobAge(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null
  const age = calculateAge(dateOfBirth)
  const shown = ymdToDmy(dateOfBirth)
  return age === null ? shown : `${shown} (${age}y)`
}

export { ymdToDmy }

/** Local "now" formatted for an <input type="datetime-local"> defaultValue. */
export function nowLocalDatetimeValue(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function telHref(phone: string | null): string | null {
  if (!phone) return null
  return `tel:${phone.replace(/\s+/g, '')}`
}

/** Best-effort wa.me link. Assumes local Egyptian numbers (leading 0) unless the number already looks international. */
export function whatsappHref(phone: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '20' + digits.slice(1)
  return `https://wa.me/${digits}`
}

export function auditName(p: AuditProfile | null | undefined): string | null {
  if (!p) return null
  return p.full_name || p.email || null
}

export type VisitStatus = 'unconfirmed' | 'confirmed' | 'missed' | 'cancelled'

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  unconfirmed: 'Unconfirmed',
  confirmed: 'Confirmed',
  missed: 'Missed',
  cancelled: 'Cancelled',
}

export const VISIT_STATUS_COLORS: Record<VisitStatus, string> = {
  unconfirmed: 'bg-slate-100 text-slate-600',
  confirmed: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-500 line-through',
}

export interface Visit {
  id: string
  patient_id: string
  provider_id: string | null
  provider?: Pick<Provider, 'first_name' | 'last_name'> | null
  location_id: string
  scheduled_at: string
  duration_minutes: number
  status: VisitStatus
  notes: string | null
}

export type ExpenseType = 'general' | 'provider_fee' | 'lab_fee'

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  general: 'General',
  provider_fee: 'Provider fee',
  lab_fee: 'Lab fee',
}

export interface Expense {
  id: string
  expense_date: string
  occurred_at: string
  description: string
  category: string | null
  item: string | null
  added_by_name: string | null
  amount: number
  payment_method: PaymentMethod | null
  expense_type: ExpenseType
  patient_id: string | null
  provider_id: string | null
  provider?: Pick<Provider, 'first_name' | 'last_name'> | null
  patient?: Pick<Patient, 'first_name' | 'middle_name' | 'last_name' | 'file_number'> | null
  entered_by: string | null
  created_at: string
  recurring_expense_id?: string | null
}

export type ToothStatus =
  | 'healthy'
  | 'decayed'
  | 'filled'
  | 'crown'
  | 'missing'
  | 'root_canal'
  | 'extraction_needed'
  | 'implant'

export const TOOTH_STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: 'Healthy',
  decayed: 'Decayed',
  filled: 'Filled',
  crown: 'Crown',
  missing: 'Missing',
  root_canal: 'Root canal',
  extraction_needed: 'Extraction needed',
  implant: 'Implant',
}

export const TOOTH_STATUS_COLORS: Record<ToothStatus, string> = {
  healthy: '#ffffff',
  decayed: '#f59e0b',
  filled: '#93c5fd',
  crown: '#fbbf24',
  missing: '#e5e7eb',
  root_canal: '#f87171',
  extraction_needed: '#ef4444',
  implant: '#a78bfa',
}

export interface ToothRecord {
  id: string
  patient_id: string
  tooth_number: number
  status: ToothStatus
  note: string | null
  updated_by: string | null
  updated_at: string
}

export interface ClinicalRecord {
  id: string
  patient_id: string
  visit_id: string | null
  note: string | null
  treatment_plan: string | null
  author_id: string | null
  author_profile?: AuditProfile | null
  created_at: string
  updated_at: string | null
  updated_by: string | null
  updated_by_profile?: AuditProfile | null
}

export interface PatientPhoto {
  id: string
  patient_id: string
  visit_id: string | null
  storage_path: string
  label: string | null
  uploaded_by: string | null
  created_at: string
}

export type LedgerEntryType = 'charge' | 'payment' | 'discount'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other' | 'mobile_wallet'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Credit card',
  transfer: 'Bank transfer',
  mobile_wallet: 'Mobile wallet',
  other: 'Other',
}

/** Payment methods offered in dropdowns, in display order. */
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'mobile_wallet']

export interface LedgerEntry {
  id: string
  patient_id: string
  entry_date: string
  occurred_at: string
  entry_type: LedgerEntryType
  description: string | null
  amount: number
  payment_method: PaymentMethod | null
  entered_by: string | null
  created_at: string
}

// ============================================================
// Recurring expenses
// ============================================================
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'
export type RecurrenceEndType = 'never' | 'until' | 'count'

/** Friendly presets for the "repeat every…" dropdown. value maps to {unit, count}. */
export const RECURRENCE_PRESETS: { value: string; label: string; unit: RecurrenceUnit; count: number }[] = [
  { value: 'weekly', label: 'Every week', unit: 'week', count: 1 },
  { value: 'biweekly', label: 'Every 2 weeks', unit: 'week', count: 2 },
  { value: 'monthly', label: 'Every month', unit: 'month', count: 1 },
  { value: 'bimonthly', label: 'Every 2 months', unit: 'month', count: 2 },
  { value: 'quarterly', label: 'Every 3 months', unit: 'month', count: 3 },
  { value: 'semiannual', label: 'Every 6 months', unit: 'month', count: 6 },
  { value: 'yearly', label: 'Every year', unit: 'year', count: 1 },
]

export const RECURRENCE_UNIT_LABELS: Record<RecurrenceUnit, string> = {
  day: 'day(s)',
  week: 'week(s)',
  month: 'month(s)',
  year: 'year(s)',
}

export interface RecurringExpense {
  id: string
  description: string
  category: string | null
  amount: number
  payment_method: PaymentMethod | null
  interval_unit: RecurrenceUnit
  interval_count: number
  start_date: string
  end_type: RecurrenceEndType
  end_date: string | null
  occurrences: number | null
  generated_count: number
  next_run_date: string
  active: boolean
  created_at: string
}

export function recurrenceSummary(r: Pick<RecurringExpense, 'interval_unit' | 'interval_count' | 'end_type' | 'end_date' | 'occurrences'>): string {
  const every = r.interval_count === 1 ? `every ${r.interval_unit}` : `every ${r.interval_count} ${RECURRENCE_UNIT_LABELS[r.interval_unit]}`
  if (r.end_type === 'until' && r.end_date) return `${every}, until ${ymdToDmy(r.end_date)}`
  if (r.end_type === 'count' && r.occurrences) return `${every}, ${r.occurrences} times`
  return `${every}`
}

// ============================================================
// HR: employees, attendance, payroll
// ============================================================
export const EMPLOYEE_POSITIONS: string[] = [
  'Receptionist',
  'Dental assistant',
  'Dental hygienist',
  'Nurse',
  'Practice manager',
  'Accountant',
  'Cleaner',
  'Security',
  'IT support',
  'Marketing',
]

export interface Employee {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  position: string | null
  date_of_birth: string | null
  hire_date: string | null
  last_working_day: string | null
  national_id: string | null
  national_id_expiry: string | null
  national_id_file_path: string | null
  phone: string | null
  email: string | null
  shift_start: string | null // 'HH:MM:SS'
  shift_end: string | null
  base_salary: number
  overtime_hourly_rate: number
  standard_daily_hours: number
  expected_work_days: number
  annual_leave_days: number
  active: boolean
  created_at: string
}

/** Duration in hours between two 'HH:MM'/'HH:MM:SS' times, treating end<=start as an overnight shift. */
export function shiftDurationHours(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  let e = toMin(end)
  const s = toMin(start)
  if (e <= s) e += 24 * 60
  return (e - s) / 60
}

export interface OvertimeDay {
  workedHours: number
  otBeforeMidnight: number
  otAfterMidnight: number
}

export interface OvertimeRules {
  standardHours: number
  shiftStart?: string | null
  shiftEnd?: string | null
  /** Max hours of early arrival (before the shift) that count as overtime. Ignored for flexible hours. */
  earlyOvertimeCapHours?: number
  /** Weekly day off (0=Sun..6=Sat). Working on this day makes every hour overtime. Default Friday (5). */
  weeklyOffDay?: number
}

/** True if a work date is the clinic's weekly day off (default Friday = 5). */
export function isWeeklyOffDate(ymd: string, weeklyOffDay = 5): boolean {
  return new Date(`${ymd}T00:00:00`).getDay() === weeklyOffDay
}

/**
 * Overtime for one attendance day, split into before/after-midnight hours (so the after-midnight
 * multiplier can apply to the late portion). Check-out at/earlier than check-in is treated as the
 * next day (PM in → AM out).
 *
 * - Friday (the weekly day off): every worked hour is overtime.
 * - Fixed shift (shiftStart + shiftEnd set): overtime = capped early-arrival before the shift +
 *   hours worked beyond the shift end.
 * - Flexible hours (no shift): overtime = hours worked beyond the standard daily hours; arriving
 *   early does NOT earn overtime.
 */
export function overtimeForDay(
  a: { check_in: string | null; check_out: string | null; work_date: string },
  rules: OvertimeRules,
): OvertimeDay {
  if (!a.check_in || !a.check_out) return { workedHours: 0, otBeforeMidnight: 0, otAfterMidnight: 0 }
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const MIDNIGHT = 24 * 60
  const inAbs = toMin(a.check_in)
  let outAbs = toMin(a.check_out)
  if (outAbs <= inAbs) outAbs += MIDNIGHT // crossed midnight → next calendar day
  const worked = (outAbs - inAbs) / 60

  const afterMidnight = (fromAbs: number) => Math.max(0, outAbs - Math.max(fromAbs, MIDNIGHT))
  const pack = (otBeforeMin: number, otAfterMin: number): OvertimeDay => ({
    workedHours: worked,
    otBeforeMidnight: otBeforeMin / 60,
    otAfterMidnight: otAfterMin / 60,
  })

  const isOffDay = new Date(`${a.work_date}T00:00:00`).getDay() === (rules.weeklyOffDay ?? 5)
  if (isOffDay) {
    const otAfter = afterMidnight(inAbs)
    return pack(outAbs - inAbs - otAfter, otAfter)
  }

  const hasShift = !!rules.shiftStart && !!rules.shiftEnd
  if (hasShift) {
    const sStart = toMin(rules.shiftStart as string)
    let sEnd = toMin(rules.shiftEnd as string)
    if (sEnd <= sStart) sEnd += MIDNIGHT // overnight shift
    // Early arrival before the shift, capped.
    const earlyRaw = Math.max(0, sStart - inAbs)
    const earlyOt = Math.min(earlyRaw, (rules.earlyOvertimeCapHours ?? 0) * 60)
    // Work beyond the shift end.
    const lateOt = Math.max(0, outAbs - sEnd)
    const lateAfter = afterMidnight(sEnd)
    return pack(earlyOt + (lateOt - lateAfter), lateAfter)
  }

  // Flexible hours: overtime is anything beyond the standard daily hours (no early-arrival bonus).
  const otStart = inAbs + rules.standardHours * 60
  const otTotal = Math.max(0, outAbs - otStart)
  const otAfter = afterMidnight(otStart)
  return pack(otTotal - otAfter, otAfter)
}

/** True if a work date falls on a Friday (the clinic's weekly day off). */
export function isFridayDate(ymd: string): boolean {
  return new Date(`${ymd}T00:00:00`).getDay() === 5
}

export type DeductionKind = 'deduction' | 'loan'

export type DeductionUnit = 'amount' | 'work_days'

export interface EmployeeDeduction {
  id: string
  employee_id: string
  kind: DeductionKind
  description: string | null
  start_date: string | null
  total_amount: number
  per_installment: number
  amount_settled: number
  deduction_unit: DeductionUnit
  work_days: number | null
  active: boolean
  created_at: string
}

export type DeductionPaymentKind = 'salary_deduction' | 'partial_settlement' | 'full_settlement'

export const DEDUCTION_PAYMENT_LABELS: Record<DeductionPaymentKind, string> = {
  salary_deduction: 'Salary deduction',
  partial_settlement: 'Partial settlement',
  full_settlement: 'Full settlement',
}

export interface DeductionPayment {
  id: string
  deduction_id: string
  amount: number
  kind: DeductionPaymentKind
  paid_on: string
  note: string | null
  created_at: string
}

export interface MiscIncome {
  id: string
  description: string
  category: string | null
  amount: number
  payment_method: PaymentMethod | null
  occurred_at: string
  income_date: string
}

export interface PayrollRun {
  id: string
  pay_month: string
  period_start: string
  period_end: string
  pay_date: string
  total_amount: number
  expense_id: string | null
  notes: string | null
  finalized_at: string
}

export interface Payslip {
  id: string
  run_id: string
  employee_id: string | null
  employee_name: string
  position: string | null
  base_salary: number
  per_day_value: number
  expected_days: number
  attended_days: number
  paid_leave_days: number
  unpaid_days: number
  regular_pay: number
  overtime_hours: number
  overtime_midnight_hours: number
  overtime_pay: number
  profit_share: number
  deductions_total: number
  rounding_adjustment: number
  net_pay: number
  breakdown: { deductions?: { description: string; amount: number }[] } | null
}

/** Whole days from today until `date` (negative if already past); null if no date. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

/** First date an employee may take leave: hire date + N months (null if no hire date). */
export function leaveEligibilityDate(hireDate: string | null, months: number): string | null {
  if (!hireDate) return null
  const d = new Date(`${hireDate}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid' | 'day_off'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual / vacation',
  sick: 'Sick',
  emergency: 'Emergency',
  unpaid: 'Unpaid',
  day_off: 'Paid day off (granted)',
}

/** These leave types draw from the paid annual allowance; 'unpaid' never does (always deducted). */
export const PAID_ELIGIBLE_LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'emergency']

/** Employer-granted paid day off: always paid, never consumes the allowance, allowed during probation. */
export const DAY_OFF_LEAVE_TYPE: LeaveType = 'day_off'

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-slate-200 text-slate-500 line-through',
}

export interface EmployeeLeave {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  leave_type: LeaveType
  status: LeaveStatus
  note: string | null
  created_at: string
}

/** Every calendar date from start to end, inclusive, as 'yyyy-mm-dd'. */
export function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (d <= last) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function inclusiveDayCount(start: string, end: string): number {
  return eachDateInclusive(start, end).length
}

export interface EmployeeAttendance {
  id: string
  employee_id: string
  work_date: string
  check_in: string | null // 'HH:MM:SS'
  check_out: string | null
  note: string | null
  created_at: string
}

export function employeeFullName(e: Pick<Employee, 'first_name' | 'middle_name' | 'last_name'>): string {
  return [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ')
}

/** Hours worked in one attendance row (0 if incomplete). Handles overnight by assuming same-day. */
export function attendanceHours(a: Pick<EmployeeAttendance, 'check_in' | 'check_out'>): number {
  if (!a.check_in || !a.check_out) return 0
  const [inH, inM] = a.check_in.split(':').map(Number)
  const [outH, outM] = a.check_out.split(':').map(Number)
  let mins = outH * 60 + outM - (inH * 60 + inM)
  if (mins < 0) mins += 24 * 60 // crossed midnight
  return mins / 60
}

/**
 * The salary period that is PAID in the given pay month (a Date anywhere in that month).
 * Attendance runs from `startDay` of the previous month to `startDay - 1` of the pay month.
 * e.g. startDay=26, pay month July → 26 Jun … 25 Jul.
 */
export function salaryPeriodFor(payMonth: Date, startDay: number): { start: Date; end: Date } {
  const y = payMonth.getFullYear()
  const m = payMonth.getMonth()
  const start = new Date(y, m - 1, startDay)
  const end = new Date(y, m, startDay - 1)
  return { start, end }
}

// ============================================================
// Inventory (dental materials stock counts)
// ============================================================
export interface Inventory {
  id: string
  name: string
  position: number
}

export interface ExpenseCategory {
  id: string
  name: string
  active: boolean
}

export interface ExpenseItem {
  id: string
  category_id: string
  name: string
  active: boolean
  position: number
}

export interface InventoryCluster {
  id: string
  inventory_id: string
  name: string
  position: number
}

export interface InventoryItem {
  id: string
  cluster_id: string
  name: string
  brand: string | null
  original_quantity: number
  position: number
  active: boolean
}

export interface InventoryCount {
  id: string
  item_id: string
  period: string
  current_quantity: number | null
  ordered: boolean
}

/** How many to buy: the shortfall against the target start-of-month quantity. */
export function needToBuy(originalQuantity: number, currentQuantity: number | null): number {
  if (currentQuantity == null) return 0
  return Math.max(0, Number(originalQuantity) - Number(currentQuantity))
}
