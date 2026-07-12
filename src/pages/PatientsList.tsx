import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Patient, Location, Provider, PatientGroup, patientFullName, calculateAge, formatDobAge, providerFullName } from '../types'
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
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('file_number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: l }, { data: pr }, { data: g }, { data: cond }] = await Promise.all([
      supabase.from('patients').select('*, provider:providers(first_name,last_name), group:patient_groups(name)').order('first_name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
      supabase.from('patient_groups').select('*').order('name'),
      supabase.from('patient_conditions').select('patient_id'),
    ])
    setPatients(p ?? [])
    setLocations(l ?? [])
    setProviders(pr ?? [])
    setGroups(g ?? [])
    setConditionPatientIds(new Set((cond ?? []).map((c: any) => c.patient_id)))
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

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase()
    return (
      patientFullName(p).toLowerCase().includes(q) ||
      (p.phone ?? '').includes(search) ||
      (p.phone_secondary ?? '').includes(search) ||
      (p.file_number ?? '').includes(search)
    )
  })

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
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.length === 0 && <p className="p-4 text-sm text-slate-500">No patients found.</p>}
          {sorted.map((p) => {
            const dobAge = formatDobAge(p.date_of_birth)
            return (
              <Link
                key={p.id}
                to={`/patients/${p.id}`}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-navy-900">
                    {patientFullName(p)}
                    <PatientBadges patient={p} elderlyAgeThreshold={settings.elderly_age_threshold} hasCondition={conditionPatientIds.has(p.id)} />
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.file_number && <>#{p.file_number}</>}
                    {dobAge && <> · {dobAge}</>}
                    {p.provider && <> · {providerFullName(p.provider)}</>}
                  </p>
                </div>
                <p className="text-sm text-slate-500">{p.phone}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
