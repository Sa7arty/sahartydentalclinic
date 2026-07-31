import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Patient, Location, Provider, PatientGroup, patientFullName, calculateAge, formatDobAge, providerFullName, missingRequiredPatientFields } from '../types'
import { formatDate } from '../lib/dates'
import { useSettings } from '../context/SettingsContext'
import PatientForm from '../components/PatientForm'
import PatientBadges from '../components/PatientBadges'

type SortKey = 'name' | 'file_number' | 'created_at' | 'age' | 'gender' | 'provider' | 'group'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'file_number', label: 'File number (ID)' },
  { key: 'name', label: 'Name' },
  { key: 'created_at', label: 'Date file was created' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'provider', label: 'Provider' },
  { key: 'group', label: 'Group' },
]

export default function PatientsList() {
  const { settings } = useSettings()
  const [patients, setPatients] = useState<Patient[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [groups, setGroups] = useState<PatientGroup[]>([])
  const [conditionPatientIds, setConditionPatientIds] = useState<Set<string>>(new Set())
  const [lastVisitByPatient, setLastVisitByPatient] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('file_number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete' | 'recall' | 'never'>('all')
  const [recallMonths, setRecallMonths] = useState(6)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkProvider, setBulkProvider] = useState('')
  const [bulkGroup, setBulkGroup] = useState('')
  const [applyingBulk, setApplyingBulk] = useState(false)

  const [nextFileNumber, setNextFileNumber] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (showNewForm && settings.auto_generate_file_number) {
      supabase.rpc('peek_next_patient_file_number').then(({ data }) => {
        if (typeof data === 'string') setNextFileNumber(data)
      })
    }
  }, [showNewForm, settings.auto_generate_file_number])

  // Supabase caps a single query at 1000 rows, so fetch the full patient list in batches.
  async function fetchAllPatients() {
    const CHUNK = 1000
    const all: Patient[] = []
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await supabase
        .from('patients')
        .select('*, provider:providers(first_name,last_name), group:patient_groups(name)')
        .order('first_name')
        .range(from, from + CHUNK - 1)
      if (error) break
      const batch = (data ?? []) as Patient[]
      all.push(...batch)
      if (batch.length < CHUNK) break
    }
    return all
  }

  async function load() {
    setLoading(true)
    const [p, { data: l }, { data: pr }, { data: g }, { data: cond }, { data: pastVisits }] = await Promise.all([
      fetchAllPatients(),
      supabase.from('locations').select('*').order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
      supabase.from('patient_groups').select('*').order('name'),
      supabase.from('patient_conditions').select('patient_id').range(0, 99999),
      supabase.from('visits').select('patient_id, scheduled_at').lte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: false }),
    ])
    setPatients(p)
    setLocations(l ?? [])
    setProviders(pr ?? [])
    setGroups(g ?? [])
    setConditionPatientIds(new Set((cond ?? []).map((c: any) => c.patient_id)))
    // First row per patient is the most recent past visit (query is sorted newest-first).
    const lastVisits: Record<string, string> = {}
    for (const v of (pastVisits ?? []) as any[]) if (!lastVisits[v.patient_id]) lastVisits[v.patient_id] = v.scheduled_at
    setLastVisitByPatient(lastVisits)
    setLoading(false)
  }

  async function handleCreate(payload: Record<string, unknown>) {
    const { error } = await supabase.from('patients').insert(payload)
    if (!error) {
      setShowNewForm(false)
      load()
    } else {
      alert(error.message)
    }
  }

  // Cutoff date for "not seen in N months" recall.
  const recallCutoff = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - recallMonths)
    return d.toISOString()
  }, [recallMonths])

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch =
      patientFullName(p).toLowerCase().includes(q) ||
      (p.phone ?? '').includes(search) ||
      (p.phone_secondary ?? '').includes(search) ||
      (p.file_number ?? '').includes(search)
    if (!matchesSearch) return false
    if (filterMode === 'incomplete') return missingRequiredPatientFields(p, settings.required_fields).length > 0
    if (filterMode === 'never') return !lastVisitByPatient[p.id]
    if (filterMode === 'recall') {
      const last = lastVisitByPatient[p.id]
      return !!last && last < recallCutoff
    }
    return true
  })

  async function applyBulk() {
    if (selected.size === 0 || (!bulkProvider && !bulkGroup)) return
    setApplyingBulk(true)
    const patch: Record<string, string> = {}
    if (bulkProvider) patch.provider_id = bulkProvider
    if (bulkGroup) patch.group_id = bulkGroup
    const { error } = await supabase.from('patients').update(patch).in('id', Array.from(selected))
    setApplyingBulk(false)
    if (error) return alert(error.message)
    setSelected(new Set())
    setBulkProvider('')
    setBulkGroup('')
    load()
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return patientFullName(a).localeCompare(patientFullName(b)) * dir
        case 'file_number':
          return (a.file_number ?? '').localeCompare(b.file_number ?? '') * dir
        case 'created_at':
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
        case 'age': {
          const ageA = calculateAge(a.date_of_birth) ?? -1
          const ageB = calculateAge(b.date_of_birth) ?? -1
          return (ageA - ageB) * dir
        }
        case 'gender':
          return (a.gender ?? '').localeCompare(b.gender ?? '') * dir
        case 'provider':
          return (a.provider ? providerFullName(a.provider) : '').localeCompare(b.provider ? providerFullName(b.provider) : '') * dir
        case 'group':
          return (a.group?.name ?? '').localeCompare(b.group?.name ?? '') * dir
        default:
          return 0
      }
    })
  }, [filtered, sortKey, sortDir])

  const pageSize = settings.patients_per_page || 25
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Jump back to the first page whenever the result set or its ordering changes.
  useEffect(() => {
    setPage(1)
  }, [search, sortKey, sortDir, pageSize, filterMode, recallMonths])

  const pageIds = paged.map((p) => p.id)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleSelectPage = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (allOnPageSelected) pageIds.forEach((id) => n.delete(id))
      else pageIds.forEach((id) => n.add(id))
      return n
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Patients</h1>
        <button
          onClick={() => setShowNewForm((s) => !s)}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
        >
          {showNewForm ? 'Cancel' : '+ New patient'}
        </button>
      </div>

      {showNewForm && (
        <PatientForm
          locations={locations}
          providers={providers}
          groups={groups}
          submitLabel="Save patient"
          onCancel={() => setShowNewForm(false)}
          onSubmit={handleCreate}
          fileNumberSlot={
            !settings.auto_generate_file_number ? (
              <input name="file_number" required placeholder="File number" className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2" />
            ) : (
              nextFileNumber && (
                <p className="text-sm text-slate-500 sm:col-span-2">
                  File number: <span className="font-medium text-navy-900">{nextFileNumber}</span> (assigned automatically)
                </p>
              )
            )
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search by name, phone, or file number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Sort by
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-300 px-2 py-2">
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          title="Toggle sort direction"
        >
          {sortDir === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Show
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as typeof filterMode)} className="rounded-lg border border-slate-300 px-2 py-2">
            <option value="all">All patients</option>
            <option value="incomplete">Incomplete files</option>
            <option value="recall">Due for recall</option>
            <option value="never">Never visited</option>
          </select>
        </label>
        {filterMode === 'recall' && (
          <label className="flex items-center gap-1 text-sm text-slate-600">
            not seen in
            <select value={recallMonths} onChange={(e) => setRecallMonths(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2">
              {[3, 6, 9, 12, 18, 24].map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Bulk-assign bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50 p-3 text-sm">
          <span className="font-medium text-navy-900">{selected.size} selected</span>
          <select value={bulkProvider} onChange={(e) => setBulkProvider(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Set provider…</option>
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {providerFullName(pr)}
              </option>
            ))}
          </select>
          <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Set group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            disabled={applyingBulk || (!bulkProvider && !bulkGroup)}
            className="rounded-lg bg-navy-900 px-3 py-1.5 font-medium text-white hover:bg-navy-800 disabled:opacity-40"
          >
            {applyingBulk ? 'Applying…' : 'Apply to selected'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">
            Clear
          </button>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} />
          Select all on this page
        </label>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.length === 0 && <p className="p-4 text-sm text-slate-500">No patients found.</p>}
          {paged.map((p) => {
            const dobAge = formatDobAge(p.date_of_birth)
            return (
              <div key={p.id} className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="shrink-0" title="Select" />
                <Link to={`/patients/${p.id}`} className="flex flex-1 items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 font-medium text-navy-900">
                      {patientFullName(p)}
                      <PatientBadges patient={p} elderlyAgeThreshold={settings.elderly_age_threshold} hasCondition={conditionPatientIds.has(p.id)} incompleteFields={missingRequiredPatientFields(p, settings.required_fields)} />
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.file_number && <>#{p.file_number}</>}
                      {dobAge && <> · {dobAge}</>}
                      {p.provider && <> · {providerFullName(p.provider)}</>}
                      {lastVisitByPatient[p.id] && <> · last visit {formatDate(lastVisitByPatient[p.id])}</>}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">{p.phone}</p>
                </Link>
              </div>
            )
          })}
        </div>
        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="px-1">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
