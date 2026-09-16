import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { auditName } from '../types'

const PAGE_SIZE = 100

const TABLE_LABELS: Record<string, string> = {
  patients: 'Patients',
  visits: 'Appointments',
  clinical_records: 'Clinical notes',
  patient_photos: 'Documents & X-rays',
  ledger_entries: 'Patient billing',
  expenses: 'Clinic expenses',
  patient_conditions: 'Medical conditions (patient)',
  patient_medications: 'Medications (patient)',
  patient_allergies: 'Allergies (patient)',
  tooth_records: 'Tooth chart',
  recurring_expenses: 'Recurring expenses',
  prescriptions: 'Prescriptions',
  patient_letters: 'Letters',
  employees: 'Employee records',
  employee_attendance: 'Attendance',
  employee_deductions: 'Deductions & loans',
  deduction_payments: 'Deduction/loan payments',
  misc_income: 'Misc income',
  payroll_runs: 'Payroll runs',
  payslips: 'Payslips',
  employee_leave: 'Leave requests',
  inventory_items: 'Inventory items',
  inventory_counts: 'Inventory counts',
}

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  insert: { label: 'Created', cls: 'bg-green-100 text-green-700' },
  update: { label: 'Updated', cls: 'bg-amber-100 text-amber-700' },
  delete: { label: 'Deleted', cls: 'bg-red-100 text-red-700' },
}

// Common fields that tend to identify "which record" across very different
// tables, tried in priority order — this is what turns a raw jsonb row into
// something like "John Adel Smith" or "Root canal — molar" instead of just an id.
const DESCRIBE_FIELD_SETS: string[][] = [
  ['first_name', 'middle_name', 'last_name'],
  ['name'],
  ['description'],
  ['note'],
  ['position'],
  ['leave_type'],
]

function describeRow(row: Record<string, unknown> | null): string | null {
  if (!row) return null
  for (const fields of DESCRIBE_FIELD_SETS) {
    const parts = fields.map((f) => row[f]).filter((v) => typeof v === 'string' && v.trim())
    if (parts.length) {
      const text = parts.join(' ')
      const amount = row.amount
      return typeof amount === 'number' || typeof amount === 'string' ? `${text} (${amount})` : text
    }
  }
  if (typeof row.amount !== 'undefined') return String(row.amount)
  return null
}

interface AuditRow {
  id: string
  created_at: string
  actor_id: string | null
  table_name: string
  record_id: string | null
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

/** Settings → Audit log: a read-only, dentist-only feed of every create/edit/delete
 * across the app's real records. Backed by database triggers (not app code), so it
 * automatically covers every current and future mutation — see supabase/schema.sql. */
export default function AuditLogTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    load(0)
  }, [])

  async function load(offset: number) {
    setLoading(true)
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    const batch = (data as AuditRow[]) ?? []
    setRows((cur) => (offset === 0 ? batch : [...cur, ...batch]))
    setHasMore(batch.length === PAGE_SIZE)

    const actorIds = Array.from(new Set(batch.map((r) => r.actor_id).filter((id): id is string => !!id)))
    if (actorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
      setNames((cur) => {
        const next = { ...cur }
        for (const p of (profiles as { id: string; full_name: string | null; email: string | null }[]) ?? []) {
          next[p.id] = auditName(p) ?? 'Unknown'
        }
        return next
      })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="font-medium text-navy-900">Audit log</h2>
          <p className="text-sm text-slate-500">Every create, edit, and delete across the app's real records — who did it, and when. Newest first.</p>
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => {
              const meta = ACTION_LABELS[r.action] ?? { label: r.action, cls: 'bg-slate-100 text-slate-600' }
              const summary = describeRow(r.action === 'delete' ? r.old_data : r.new_data)
              const isOpen = expanded === r.id
              return (
                <div key={r.id} className="py-2.5">
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.cls}`}>{meta.label}</span>
                    <span className="text-sm font-medium text-navy-900">{TABLE_LABELS[r.table_name] ?? r.table_name}</span>
                    {summary && <span className="truncate text-sm text-slate-600">— {summary}</span>}
                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                      {r.actor_id ? names[r.actor_id] ?? '…' : 'System'} · {new Date(r.created_at).toLocaleString()}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                      {r.old_data && (
                        <div>
                          <p className="mb-1 font-semibold text-slate-500">Before</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(r.old_data, null, 1)}</pre>
                        </div>
                      )}
                      {r.new_data && (
                        <div>
                          <p className="mb-1 font-semibold text-slate-500">After</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(r.new_data, null, 1)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {hasMore && (
          <button onClick={() => load(rows.length)} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50 disabled:opacity-50">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
