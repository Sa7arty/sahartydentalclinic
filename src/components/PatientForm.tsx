import { FormEvent, ReactNode, useState } from 'react'
import { Location, Provider, Patient, PatientGroup, providerFullName, MARITAL_STATUS_OPTIONS } from '../types'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { WORLD_COUNTRIES } from '../data/countries'
import { EGYPT_CITIES } from '../data/egyptCities'
import { districtsForCity } from '../data/districts'

interface Props {
  initial?: Partial<Patient>
  locations: Location[]
  providers: Provider[]
  groups: PatientGroup[]
  onCancel: () => void
  onSubmit: (payload: Record<string, unknown>) => void | Promise<void>
  submitLabel: string
  fileNumberSlot?: ReactNode
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label className="mb-1 block text-sm text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2'

export default function PatientForm({ initial, locations, providers, groups, onCancel, onSubmit, submitLabel, fileNumberSlot }: Props) {
  const { locationIds } = useAuth()
  const { settings } = useSettings()
  const isNew = !initial?.id
  const [country, setCountry] = useState(initial?.country ?? (isNew ? settings.default_country ?? '' : ''))
  const [city, setCity] = useState(initial?.city ?? '')
  const [submitting, setSubmitting] = useState(false)

  const isEgypt = country.trim().toLowerCase() === 'egypt'
  const districtOptions = districtsForCity(city)
  const req = (key: string) => settings.required_fields.includes(key)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    // Single-clinic app: default every patient to the clinic location automatically.
    const clinicLocation = initial?.primary_location_id ?? locationIds[0] ?? locations[0]?.id
    const payload: Record<string, unknown> = {
      first_name: form.get('first_name'),
      middle_name: form.get('middle_name') || null,
      last_name: form.get('last_name'),
      gender: form.get('gender') || null,
      date_of_birth: form.get('date_of_birth') || null,
      marital_status: form.get('marital_status') || null,
      nationality: form.get('nationality') || null,
      national_id: form.get('national_id') || null,
      occupation: form.get('occupation') || null,
      phone: form.get('phone'),
      phone_secondary: form.get('phone_secondary'),
      email: form.get('email') || null,
      country: form.get('country') || null,
      city: form.get('city') || null,
      district: form.get('district') || null,
      address: form.get('address'),
      provider_id: form.get('provider_id') || null,
      group_id: form.get('group_id') || null,
      notes: form.get('notes') || null,
      primary_location_id: clinicLocation,
    }
    if (form.get('file_number')) payload.file_number = form.get('file_number')
    setSubmitting(true)
    await onSubmit(payload)
    setSubmitting(false)
  }

  const defaultNationality = initial?.nationality ?? (isNew ? settings.default_nationality ?? '' : '')

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      {fileNumberSlot}
      {!isNew && (
        <Field label="File number" wide>
          <input name="file_number" defaultValue={initial?.file_number ?? ''} className={inputClass} />
        </Field>
      )}

      <Field label="First name" required={req('first_name')}>
        <input name="first_name" required={req('first_name')} defaultValue={initial?.first_name ?? ''} className={inputClass} />
      </Field>
      <Field label="Middle name" required={req('middle_name')}>
        <input name="middle_name" required={req('middle_name')} defaultValue={initial?.middle_name ?? ''} className={inputClass} />
      </Field>
      <Field label="Last name" required={req('last_name')} wide>
        <input name="last_name" required={req('last_name')} defaultValue={initial?.last_name ?? ''} className={inputClass} />
      </Field>

      <Field label="Gender" required={req('gender')}>
        <select name="gender" required={req('gender')} defaultValue={initial?.gender ?? ''} className={inputClass}>
          <option value="" disabled>
            Select gender
          </option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>
      <Field label="Date of birth" required={req('date_of_birth')}>
        <input name="date_of_birth" required={req('date_of_birth')} type="date" defaultValue={initial?.date_of_birth ?? ''} className={inputClass} />
      </Field>

      <Field label="Marital status" required={req('marital_status')}>
        <select name="marital_status" required={req('marital_status')} defaultValue={initial?.marital_status ?? ''} className={inputClass}>
          <option value="">—</option>
          {MARITAL_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Occupation" required={req('occupation')}>
        <input name="occupation" required={req('occupation')} defaultValue={initial?.occupation ?? ''} className={inputClass} />
      </Field>

      <Field label="Nationality" required={req('nationality')}>
        <input name="nationality" list="nationality-options" required={req('nationality')} defaultValue={defaultNationality} className={inputClass} />
        <datalist id="nationality-options">
          {WORLD_COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="National ID (NID)" required={req('national_id')} wide>
        <input name="national_id" required={req('national_id')} defaultValue={initial?.national_id ?? ''} className={inputClass} />
      </Field>

      <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-slate-500">Contact info</legend>
        <Field label="Phone" required={req('phone')}>
          <input name="phone" required={req('phone')} defaultValue={initial?.phone ?? ''} className={inputClass} />
        </Field>
        <Field label="Phone (alternate)" required={req('phone_secondary')}>
          <input name="phone_secondary" required={req('phone_secondary')} defaultValue={initial?.phone_secondary ?? ''} className={inputClass} />
        </Field>
        <Field label="Email" required={req('email')} wide>
          <input name="email" type="email" required={req('email')} defaultValue={initial?.email ?? ''} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-slate-500">Provider &amp; group</legend>
        <Field label="Provider" required={req('provider_id')}>
          <select name="provider_id" required={req('provider_id')} defaultValue={initial?.provider_id ?? ''} className={inputClass}>
            <option value="">No provider assigned</option>
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {providerFullName(pr)}
                {!pr.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group" required={req('group_id')}>
          <select name="group_id" required={req('group_id')} defaultValue={initial?.group_id ?? ''} className={inputClass}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {!g.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-slate-500">Address</legend>
        <Field label="Country" required={req('country')}>
          <input
            name="country"
            list="country-options"
            required={req('country')}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              setCity('')
            }}
            className={inputClass}
          />
          <datalist id="country-options">
            {WORLD_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="City" required={req('city')}>
          <input
            name="city"
            list={isEgypt ? 'city-options' : undefined}
            required={req('city')}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
          {isEgypt && (
            <datalist id="city-options">
              {EGYPT_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label="District / area" required={req('district')}>
          <input
            name="district"
            list={districtOptions.length > 0 ? 'district-options' : undefined}
            required={req('district')}
            defaultValue={initial?.district ?? ''}
            className={inputClass}
          />
          {districtOptions.length > 0 && (
            <datalist id="district-options">
              {districtOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label="Street address" required={req('address')}>
          <input name="address" required={req('address')} defaultValue={initial?.address ?? ''} className={inputClass} />
        </Field>
      </fieldset>

      <Field label="Notes" required={req('notes')} wide>
        <textarea name="notes" required={req('notes')} defaultValue={initial?.notes ?? ''} className={inputClass} />
      </Field>

      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" disabled={submitting} className="rounded-lg bg-gold-500 px-4 py-2 font-medium text-navy-950 hover:bg-gold-400 disabled:opacity-50">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-navy-800 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  )
}
