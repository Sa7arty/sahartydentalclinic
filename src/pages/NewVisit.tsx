import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import PatientForm from '../components/PatientForm'
import { Patient, Location, Provider, PatientGroup, providerFullName, patientFullName, formatDobAge } from '../types'

// Supabase caps a single request at 1000 rows. The clinic has more patients than
// that, so we page through them in 1000-row batches — otherwise patients past the
// first 1000 (alphabetically) can't be found when adding a visit. `buildQuery`
// must return a FRESH query each call (a builder can't be reused after awaiting).
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

export default function NewVisit() {
  const navigate = useNavigate()
  const { locationIds } = useAuth()
  const { settings } = useSettings()
  const [patients, setPatients] = useState<Patient[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [groups, setGroups] = useState<PatientGroup[]>([])
  const [search, setSearch] = useState('')
  const [showNewPatientForm, setShowNewPatientForm] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [scheduling, setScheduling] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [p, { data: l }, { data: pr }, { data: g }] = await Promise.all([
      fetchAllRows<Patient>(() =>
        supabase.from('patients').select('*, provider:providers(first_name,last_name)').order('first_name').order('id', { ascending: true }),
      ),
      supabase.from('locations').select('*').order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
      supabase.from('patient_groups').select('*').order('name'),
    ])
    setPatients(p ?? [])
    setLocations(l ?? [])
    setProviders(pr ?? [])
    setGroups(g ?? [])
    setLoading(false)
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? patients.filter(
        (p) =>
          patientFullName(p).toLowerCase().includes(q) ||
          (p.file_number ?? '').toLowerCase().includes(q) ||
          (p.phone ?? '').includes(search) ||
          (p.phone_secondary ?? '').includes(search),
      )
    : []

  async function handleCreatePatient(payload: Record<string, unknown>) {
    const { data, error } = await supabase.from('patients').insert(payload).select().single()
    if (error) {
      alert(error.message)
      return
    }
    setShowNewPatientForm(false)
    setSelectedPatient(data as Patient)
  }

  async function handleScheduleVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedPatient) return
    const form = new FormData(e.currentTarget)
    const providerId = (form.get('provider_id') as string) || null
    if (settings.visit_provider_required && !providerId) {
      alert('Please choose a provider for this visit.')
      return
    }
    setScheduling(true)
    const clinicLocation = selectedPatient.primary_location_id ?? locationIds[0] ?? locations[0]?.id
    const { error } = await supabase.from('visits').insert({
      patient_id: selectedPatient.id,
      location_id: clinicLocation,
      provider_id: providerId,
      // datetime-local has no timezone; interpret it as local time and store as
      // a proper ISO instant so the Schedule shows the exact time that was picked.
      scheduled_at: new Date(form.get('scheduled_at') as string).toISOString(),
      duration_minutes: Number(form.get('duration_minutes')),
      notes: form.get('notes') || null,
      status: (form.get('status') as string) || 'unconfirmed',
    })
    setScheduling(false)
    if (error) {
      alert(error.message)
      return
    }
    navigate('/schedule')
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy-900">Add visit</h1>
        <button onClick={() => navigate('/schedule')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
          Cancel
        </button>
      </div>

      {!selectedPatient && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-navy-900">1. Find the patient</label>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, file number, or phone…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            {q && (
              <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                {filtered.length === 0 && <p className="p-3 text-sm text-slate-500">No matching patients.</p>}
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-navy-900">{patientFullName(p)}</p>
                      <p className="text-xs text-slate-400">
                        {p.file_number && <>#{p.file_number}</>}
                        {formatDobAge(p.date_of_birth) && <> · {formatDobAge(p.date_of_birth)}</>}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">{p.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <button
              onClick={() => setShowNewPatientForm((s) => !s)}
              className="text-sm font-medium text-navy-700 hover:underline"
            >
              {showNewPatientForm ? 'Cancel new patient' : "Can't find them? + Create a new patient"}
            </button>
            {showNewPatientForm && (
              <div className="mt-4">
                <PatientForm
                  locations={locations}
                  providers={providers}
                  groups={groups}
                  submitLabel="Create patient & continue"
                  onCancel={() => setShowNewPatientForm(false)}
                  onSubmit={handleCreatePatient}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm text-slate-500">2. Scheduling for</p>
              <p className="text-lg font-medium text-navy-900">{patientFullName(selectedPatient)}</p>
              <p className="text-xs text-slate-400">
                {selectedPatient.file_number && <>#{selectedPatient.file_number} · </>}
                {selectedPatient.phone}
              </p>
            </div>
            <button onClick={() => setSelectedPatient(null)} className="text-sm text-navy-700 hover:underline">
              Change patient
            </button>
          </div>

          <form onSubmit={handleScheduleVisit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Date &amp; time</label>
              <input name="scheduled_at" type="datetime-local" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Duration</label>
              <select name="duration_minutes" defaultValue={settings.default_visit_duration_minutes} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {[15, 20, 30, 45, 60, 75, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Provider (for this appointment){settings.visit_provider_required ? ' *' : ''}</label>
              <select name="provider_id" defaultValue={selectedPatient.provider_id ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="">{settings.visit_provider_required ? '— Select a provider —' : 'No provider'}</option>
                {providers.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {providerFullName(pr)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Status</label>
              <select name="status" defaultValue="unconfirmed" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="unconfirmed">Unconfirmed</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">Notes</label>
              <textarea name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <button type="submit" disabled={scheduling} className="rounded-lg bg-gold-500 px-4 py-2 font-medium text-navy-950 hover:bg-gold-400 disabled:opacity-50 sm:col-span-2">
              {scheduling ? 'Scheduling…' : 'Schedule visit'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
