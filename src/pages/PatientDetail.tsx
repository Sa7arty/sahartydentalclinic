import { FormEvent, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/confirmDialog'
import { syncVisitToGoogle, deleteVisitFromGoogle } from '../lib/googleCalendarSync'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import RoleGate from '../components/RoleGate'
import PatientForm from '../components/PatientForm'
import PatientBadges from '../components/PatientBadges'
import ToothChart from '../components/ToothChart'
import { exportLedgerStatementPdf, exportPrescriptionPdf, exportPaymentReceiptPdf, exportLetterPdf } from '../lib/pdf'
import { LETTER_TEMPLATES, getLetterTemplate, OTHER_OPTION, LetterFieldDef } from '../lib/letterTemplates'
import { formatDate, formatDateTime, toDatetimeLocal } from '../lib/dates'
import {
  Patient,
  Visit,
  ClinicalRecord,
  PatientPhoto,
  LedgerEntry,
  Location,
  Provider,
  PatientGroup,
  PatientCondition,
  PatientMedication,
  PatientAllergy,
  COMMON_ALLERGIES,
  Prescription,
  PrescriptionItem,
  PatientLetter,
  Expense,
  patientFullName,
  missingRequiredPatientFields,
  calculateAge,
  auditName,
  providerFullName,
  VisitStatus,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_COLORS,
  PaymentMethod,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  formatMoney,
  nowLocalDatetimeValue,
} from '../types'

type Tab = 'info' | 'visits' | 'medical' | 'notes' | 'teeth' | 'photos' | 'ledger' | 'prescriptions' | 'letters'

const EMPTY_RX: PrescriptionItem = { drug: '', dosage: '', frequency: '', duration: '', instructions: '' }

const DOC_CATEGORIES = ['Photo', 'X-ray', 'Consent form', 'Lab result', 'Insurance', 'Other']
function isImagePath(path: string) {
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(path)
}

const PATIENT_SELECT =
  '*, provider:providers(first_name,last_name), group:patient_groups(name), created_by_profile:profiles!patients_created_by_fkey(full_name,email), updated_by_profile:profiles!patients_updated_by_fkey(full_name,email)'

const LEDGER_LABELS: Record<string, string> = { charge: 'Charge', payment: 'Payment', discount: 'Discount' }

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, isDentist } = useAuth()
  const { settings } = useSettings()
  const [tab, setTab] = useState<Tab>('info')
  const [txType, setTxType] = useState<'payment' | 'charge' | 'discount' | 'provider_fee' | 'lab_fee'>('payment')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [records, setRecords] = useState<ClinicalRecord[]>([])
  const [photos, setPhotos] = useState<PatientPhoto[]>([])
  const [photoThumbs, setPhotoThumbs] = useState<Record<string, string>>({})
  const [docCategory, setDocCategory] = useState('Photo')
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [clinicCosts, setClinicCosts] = useState<Expense[]>([])
  const [conditions, setConditions] = useState<PatientCondition[]>([])
  const [medications, setMedications] = useState<PatientMedication[]>([])
  const [allergies, setAllergies] = useState<PatientAllergy[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([{ ...EMPTY_RX }])
  const [rxPrescriber, setRxPrescriber] = useState('')
  const [rxNotes, setRxNotes] = useState('')
  const [letters, setLetters] = useState<PatientLetter[]>([])
  const [letterTemplateKey, setLetterTemplateKey] = useState(LETTER_TEMPLATES[0].key)
  const [letterAuthor, setLetterAuthor] = useState('')
  const [letterValues, setLetterValues] = useState<Record<string, string>>({})
  const [conditionOptions, setConditionOptions] = useState<string[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [groups, setGroups] = useState<PatientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
  const [visitNoteDraft, setVisitNoteDraft] = useState('')
  const [visitWhenDraft, setVisitWhenDraft] = useState('')
  const [visitDurationDraft, setVisitDurationDraft] = useState(60)

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [recordDraft, setRecordDraft] = useState({ note: '', treatment_plan: '' })

  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null)
  const [editingCostId, setEditingCostId] = useState<string | null>(null)

  useEffect(() => {
    if (id) load(id)
  }, [id])

  async function load(patientId: string) {
    setLoading(true)
    const [
      { data: p },
      { data: v },
      { data: r },
      { data: ph },
      { data: l },
      { data: costs },
      { data: cond },
      { data: meds },
      { data: locs },
      { data: prov },
      { data: grp },
      { data: condOpts },
      { data: alg },
      { data: rx },
      { data: ltrs },
    ] = await Promise.all([
      supabase.from('patients').select(PATIENT_SELECT).eq('id', patientId).single(),
      supabase.from('visits').select('*, provider:providers(first_name,last_name)').eq('patient_id', patientId).order('scheduled_at', { ascending: false }),
      supabase.from('clinical_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('patient_photos').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('ledger_entries').select('*').eq('patient_id', patientId).order('occurred_at', { ascending: false }),
      supabase.from('expenses').select('*, provider:providers(first_name,last_name)').eq('patient_id', patientId).order('occurred_at', { ascending: false }),
      supabase.from('patient_conditions').select('*').eq('patient_id', patientId).order('created_at'),
      supabase.from('patient_medications').select('*').eq('patient_id', patientId).order('created_at'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('providers').select('*').order('first_name'),
      supabase.from('patient_groups').select('*').order('name'),
      supabase.from('medical_conditions').select('name').eq('active', true).order('name'),
      supabase.from('patient_allergies').select('*').eq('patient_id', patientId).order('created_at'),
      supabase.from('prescriptions').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('patient_letters').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ])
    setPatient(p ?? null)
    setVisits(v ?? [])
    setRecords(r ?? [])
    setPhotos(ph ?? [])
    setLedger(l ?? [])
    setClinicCosts(costs ?? [])
    setConditions(cond ?? [])
    setMedications(meds ?? [])
    setAllergies(alg ?? [])
    setPrescriptions((rx as Prescription[]) ?? [])
    setLetters((ltrs as PatientLetter[]) ?? [])
    setLocations(locs ?? [])
    setProviders(prov ?? [])
    setGroups(grp ?? [])
    setConditionOptions((condOpts ?? []).map((c: any) => c.name))
    // Default the prescriber to the patient's assigned provider (only if not already typed).
    const prescriber = (prov ?? []).find((pr: any) => pr.id === (p as any)?.provider_id)
    if (prescriber) {
      setRxPrescriber((cur) => cur || providerFullName(prescriber))
      setLetterAuthor((cur) => cur || `Dr. ${providerFullName(prescriber)}`)
    }
    setLoading(false)
  }

  function updateRx(i: number, field: keyof PrescriptionItem, val: string) {
    setRxItems((items) => items.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)))
  }
  async function handleSavePrescription() {
    if (!id) return
    const clean = rxItems
      .map((it) => ({
        drug: it.drug.trim(),
        dosage: it.dosage.trim(),
        frequency: it.frequency.trim(),
        duration: it.duration.trim(),
        instructions: it.instructions.trim(),
      }))
      .filter((it) => it.drug)
    if (clean.length === 0) {
      alert('Add at least one medication (the drug name is required).')
      return
    }
    const { error } = await supabase.from('prescriptions').insert({
      patient_id: id,
      prescriber_name: rxPrescriber.trim() || null,
      notes: rxNotes.trim() || null,
      items: clean,
    })
    if (error) {
      alert(error.message)
      return
    }
    if (patient) exportPrescriptionPdf(patient, rxPrescriber.trim(), clean, rxNotes.trim(), new Date().toLocaleDateString())
    setRxItems([{ ...EMPTY_RX }])
    setRxNotes('')
    load(id)
  }
  function reprintPrescription(p: Prescription) {
    if (patient) exportPrescriptionPdf(patient, p.prescriber_name || '', p.items || [], p.notes || '', new Date(p.created_at).toLocaleDateString())
  }
  async function handleDeletePrescription(pid: string) {
    if (!(await confirmDialog('Delete this prescription? This cannot be undone.'))) return
    const { error } = await supabase.from('prescriptions').delete().eq('id', pid)
    if (error) alert(error.message)
    else if (id) load(id)
  }

  function updateLetterField(key: string, val: string) {
    setLetterValues((v) => ({ ...v, [key]: val }))
  }
  function printLetter(templateKey: string, values: Record<string, string>, authorName: string) {
    if (!patient) return
    const template = getLetterTemplate(templateKey)
    if (!template) return
    const title = template.titleOverride ? template.titleOverride(values) : template.label
    const body = template.buildBody(patientFullName(patient), values)
    exportLetterPdf(title, patient, new Date().toLocaleDateString(), body, authorName)
  }
  function resolvedLetterFieldValue(f: LetterFieldDef): string {
    const raw = (letterValues[f.key] ?? f.defaultValue ?? '').trim()
    if (f.allowOther && raw === OTHER_OPTION) return (letterValues[`${f.key}__other`] ?? '').trim()
    return raw
  }
  async function handleSaveLetter() {
    if (!id) return
    const template = getLetterTemplate(letterTemplateKey)
    if (!template) return
    const missing = template.fields.filter((f) => f.required && !resolvedLetterFieldValue(f))
    if (missing.length > 0) {
      alert(`Please fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    const values: Record<string, string> = {}
    for (const f of template.fields) values[f.key] = resolvedLetterFieldValue(f)
    const title = template.titleOverride ? template.titleOverride(values) : template.label
    const { error } = await supabase.from('patient_letters').insert({
      patient_id: id,
      letter_type: template.key,
      title,
      field_values: values,
      author_name: letterAuthor.trim() || null,
    })
    if (error) {
      alert(error.message)
      return
    }
    printLetter(template.key, values, letterAuthor.trim())
    setLetterValues({})
    load(id)
  }
  function reprintLetter(l: PatientLetter) {
    printLetter(l.letter_type, l.field_values, l.author_name || '')
  }
  async function handleDeleteLetter(lid: string) {
    if (!(await confirmDialog('Delete this letter? This cannot be undone.'))) return
    const { error } = await supabase.from('patient_letters').delete().eq('id', lid)
    if (error) alert(error.message)
    else if (id) load(id)
  }

  async function handleToggleSmoker(isSmoker: boolean) {
    if (!id) return
    setPatient((cur) => (cur ? { ...cur, is_smoker: isSmoker } : cur))
    const { error } = await supabase.from('patients').update({ is_smoker: isSmoker }).eq('id', id)
    if (error) alert(error.message)
  }

  async function handleSaveEdit(payload: Record<string, unknown>) {
    if (!id) return
    const { error } = await supabase.from('patients').update(payload).eq('id', id)
    if (!error) {
      setEditing(false)
      load(id)
    } else if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      alert('That file number is already used by another patient. Please choose a different number.')
    } else {
      alert(error.message)
    }
  }

  async function handleDeletePatient() {
    if (!id || !patient) return
    if (!(await confirmDialog(`Permanently delete ${patientFullName(patient)}'s file and all their visits, notes, ledger and records? This cannot be undone.`))) return
    const { error } = await supabase.from('patients').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate('/patients')
  }

  async function handleNewVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id || !patient?.primary_location_id) return
    const form = new FormData(e.currentTarget)
    const providerId = (form.get('provider_id') as string) || null
    if (settings.visit_provider_required && !providerId) {
      alert('Please choose a provider for this visit.')
      return
    }
    const { data, error } = await supabase
      .from('visits')
      .insert({
        patient_id: id,
        location_id: patient.primary_location_id,
        provider_id: providerId,
        // Interpret the local datetime-local value and store as an ISO instant so
        // the visit shows at the exact time that was picked (no timezone shift).
        scheduled_at: new Date(form.get('scheduled_at') as string).toISOString(),
        status: (form.get('status') as string) || 'unconfirmed',
      })
      .select()
      .single()
    if (!error) {
      load(id)
      if (data) syncVisitToGoogle(data.id)
    } else alert(error.message)
  }

  async function handleChangeVisitStatus(visitId: string, status: VisitStatus) {
    if (!id) return
    const { error } = await supabase.from('visits').update({ status }).eq('id', visitId)
    if (!error) {
      load(id)
      syncVisitToGoogle(visitId)
    } else alert(error.message)
  }

  async function handleChangeVisitProvider(visitId: string, providerId: string) {
    if (!id) return
    // A synced event lives on the OLD provider's Google Calendar, so clear the
    // event id — the next sync creates a fresh event on the new provider's calendar.
    const { error } = await supabase.from('visits').update({ provider_id: providerId || null, google_event_id: null }).eq('id', visitId)
    if (!error) {
      load(id)
      syncVisitToGoogle(visitId)
    } else alert(error.message)
  }

  async function handleSaveVisit(visitId: string) {
    if (!id) return
    const patch: Record<string, unknown> = {
      notes: visitNoteDraft || null,
      duration_minutes: visitDurationDraft,
    }
    if (visitWhenDraft) patch.scheduled_at = new Date(visitWhenDraft).toISOString()
    const { error } = await supabase.from('visits').update(patch).eq('id', visitId)
    if (!error) {
      setExpandedVisitId(null)
      load(id)
      syncVisitToGoogle(visitId)
    } else alert(error.message)
  }

  async function handleDeleteVisit(visitId: string) {
    if (!id) return
    if (!(await confirmDialog('Delete this appointment? This cannot be undone.'))) return
    deleteVisitFromGoogle(visitId)
    const { error } = await supabase.from('visits').delete().eq('id', visitId)
    if (!error) {
      setExpandedVisitId(null)
      load(id)
    } else alert(error.message)
  }

  async function handleNewNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const { error } = await supabase.from('clinical_records').insert({
      patient_id: id,
      note: form.get('note'),
      treatment_plan: form.get('treatment_plan'),
      author_id: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  async function handleSaveRecordEdit(recordId: string) {
    if (!id) return
    const { error } = await supabase
      .from('clinical_records')
      .update({ note: recordDraft.note || null, treatment_plan: recordDraft.treatment_plan || null })
      .eq('id', recordId)
    if (!error) {
      setEditingRecordId(null)
      load(id)
    } else alert(error.message)
  }

  async function handleAddCondition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const condition = (form.get('condition') as string)?.trim()
    if (!condition) return
    const { error } = await supabase.from('patient_conditions').insert({
      patient_id: id,
      condition,
      note: (form.get('note') as string)?.trim() || null,
      created_by: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  async function handleDeleteCondition(condId: string) {
    const { error } = await supabase.from('patient_conditions').delete().eq('id', condId)
    if (!error && id) load(id)
    else if (error) alert(error.message)
  }

  async function handleAddMedication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const name = (form.get('name') as string)?.trim()
    if (!name) return
    const { error } = await supabase.from('patient_medications').insert({ patient_id: id, name, created_by: session?.user.id })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  async function handleDeleteMedication(medId: string) {
    const { error } = await supabase.from('patient_medications').delete().eq('id', medId)
    if (!error && id) load(id)
    else if (error) alert(error.message)
  }

  async function handleAddAllergy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const name = (form.get('name') as string)?.trim()
    if (!name) return
    const { error } = await supabase.from('patient_allergies').insert({
      patient_id: id,
      name,
      note: (form.get('note') as string)?.trim() || null,
      created_by: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  async function handleDeleteAllergy(allergyId: string) {
    const { error } = await supabase.from('patient_allergies').delete().eq('id', allergyId)
    if (!error && id) load(id)
    else if (error) alert(error.message)
  }

  async function handleUploadPhoto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const file = form.get('file') as File
    const note = ((form.get('note') as string) || '').trim()
    const label = note ? `${docCategory} — ${note}` : docCategory
    if (!file || file.size === 0) return

    const path = `${id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('patient-photos').upload(path, file)
    if (uploadError) return alert(uploadError.message)

    const { error } = await supabase.from('patient_photos').insert({
      patient_id: id,
      storage_path: path,
      label,
      uploaded_by: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      setDocCategory('Photo')
      load(id)
    } else alert(error.message)
  }

  async function handleDeletePhoto(photo: PatientPhoto) {
    if (!(await confirmDialog('Delete this document? This cannot be undone.'))) return
    await supabase.storage.from('patient-photos').remove([photo.storage_path])
    const { error } = await supabase.from('patient_photos').delete().eq('id', photo.id)
    if (error) alert(error.message)
    else if (id) load(id)
  }

  async function handleViewDocument(path: string) {
    const { data, error } = await supabase.storage.from('patient-photos').createSignedUrl(path, 60)
    if (error || !data) return alert('Could not open the file.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // Fetch inline thumbnails for image documents (PDFs stay icon-only, opened via handleViewDocument).
  useEffect(() => {
    const imagePhotos = photos.filter((p) => isImagePath(p.storage_path) && !photoThumbs[p.id])
    if (imagePhotos.length === 0) return
    let cancelled = false
    Promise.all(
      imagePhotos.map(async (p) => {
        const { data } = await supabase.storage.from('patient-photos').createSignedUrl(p.storage_path, 600)
        return [p.id, data?.signedUrl] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setPhotoThumbs((cur) => {
        const next = { ...cur }
        for (const [id2, url] of pairs) if (url) next[id2] = url
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  async function handleLedgerEntry(e: FormEvent<HTMLFormElement>, entryType: 'charge' | 'payment') {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const { error } = await supabase.from('ledger_entries').insert({
      patient_id: id,
      entry_type: entryType,
      description: form.get('description'),
      amount: form.get('amount'),
      payment_method: entryType === 'payment' ? form.get('payment_method') : null,
      occurred_at: occurredAt ? new Date(occurredAt as string).toISOString() : undefined,
      entered_by: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  // One compact form for every money movement on the patient (charge, payment, provider/lab fee).
  async function handleAddTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const occurredAt = form.get('occurred_at')
    const occurred = occurredAt ? new Date(occurredAt as string) : new Date()
    let error
    if (txType === 'charge' || txType === 'payment' || txType === 'discount') {
      ;({ error } = await supabase.from('ledger_entries').insert({
        patient_id: id,
        entry_type: txType,
        description: form.get('description') || null,
        amount: form.get('amount'),
        payment_method: txType === 'payment' ? form.get('payment_method') || 'cash' : null,
        occurred_at: occurred.toISOString(),
        entered_by: session?.user.id,
      }))
    } else {
      ;({ error } = await supabase.from('expenses').insert({
        patient_id: id,
        expense_type: txType,
        provider_id: txType === 'provider_fee' ? form.get('provider_id') || null : null,
        description: (form.get('description') as string) || (txType === 'provider_fee' ? 'Provider fee' : 'Lab fee'),
        category: txType === 'provider_fee' ? 'Provider fee' : 'Lab fee',
        amount: form.get('amount'),
        payment_method: form.get('payment_method') || null,
        occurred_at: occurred.toISOString(),
        expense_date: occurred.toISOString().slice(0, 10),
        entered_by: session?.user.id,
      }))
    }
    if (!error) {
      formEl.reset()
      load(id)
    } else alert(error.message)
  }

  // Provider fees and lab fees are clinic COSTS tied to this patient. They live in the
  // shared `expenses` table so they roll up into the Balance/Dashboard totals automatically.
  async function handleAddClinicCost(e: FormEvent<HTMLFormElement>, expenseType: 'provider_fee' | 'lab_fee') {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const occurred = occurredAt ? new Date(occurredAt as string) : new Date()
    const { error } = await supabase.from('expenses').insert({
      patient_id: id,
      expense_type: expenseType,
      provider_id: expenseType === 'provider_fee' ? form.get('provider_id') || null : null,
      description: (form.get('description') as string) || (expenseType === 'provider_fee' ? 'Provider fee' : 'Lab fee'),
      category: expenseType === 'provider_fee' ? 'Provider fee' : 'Lab fee',
      amount: form.get('amount'),
      payment_method: form.get('payment_method') || null,
      occurred_at: occurred.toISOString(),
      expense_date: occurred.toISOString().slice(0, 10),
      entered_by: session?.user.id,
    })
    if (!error) {
      e.currentTarget.reset()
      load(id)
    } else alert(error.message)
  }

  async function handleSaveLedgerEdit(e: FormEvent<HTMLFormElement>, entry: LedgerEntry) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const { error } = await supabase
      .from('ledger_entries')
      .update({
        description: form.get('description') || null,
        amount: form.get('amount'),
        payment_method: entry.entry_type === 'payment' ? form.get('payment_method') : null,
        occurred_at: occurredAt ? new Date(occurredAt as string).toISOString() : undefined,
      })
      .eq('id', entry.id)
    if (!error) {
      setEditingLedgerId(null)
      load(id)
    } else alert(error.message)
  }

  async function handleDeleteLedgerEntry(entryId: string) {
    if (!id) return
    if (!(await confirmDialog('Delete this ledger entry? This cannot be undone.'))) return
    const { error } = await supabase.from('ledger_entries').delete().eq('id', entryId)
    if (!error) load(id)
    else alert(error.message)
  }

  async function handleSaveClinicCostEdit(e: FormEvent<HTMLFormElement>, cost: Expense) {
    e.preventDefault()
    if (!id) return
    const form = new FormData(e.currentTarget)
    const occurredAt = form.get('occurred_at')
    const occurred = occurredAt ? new Date(occurredAt as string) : new Date(cost.occurred_at)
    const { error } = await supabase
      .from('expenses')
      .update({
        provider_id: cost.expense_type === 'provider_fee' ? form.get('provider_id') || null : null,
        description: (form.get('description') as string) || (cost.expense_type === 'provider_fee' ? 'Provider fee' : 'Lab fee'),
        amount: form.get('amount'),
        payment_method: form.get('payment_method') || null,
        occurred_at: occurred.toISOString(),
        expense_date: occurred.toISOString().slice(0, 10),
      })
      .eq('id', cost.id)
    if (!error) {
      setEditingCostId(null)
      load(id)
    } else alert(error.message)
  }

  async function handleDeleteClinicCost(costId: string) {
    if (!id) return
    if (!(await confirmDialog('Delete this clinic cost? This cannot be undone.'))) return
    const { error } = await supabase.from('expenses').delete().eq('id', costId)
    if (!error) load(id)
    else alert(error.message)
  }

  if (loading) return <p className="text-slate-500">Loading…</p>
  if (!patient) return <p className="text-slate-500">Patient not found (or you don't have access).</p>

  const money = (n: number) => formatMoney(n, settings)
  const balance = ledger.reduce((sum, l) => sum + (l.entry_type === 'charge' ? Number(l.amount) : -Number(l.amount)), 0)

  // Soonest upcoming appointment that isn't cancelled/missed (visits are sorted newest-first).
  const nowIso = new Date().toISOString()
  const nextVisit = [...visits]
    .filter((v) => v.scheduled_at >= nowIso && v.status !== 'cancelled' && v.status !== 'missed')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0]

  // Unified cashflow: charges, payments and clinic costs merged and sorted newest-first.
  const cashflow = [
    ...ledger.map((l) => ({ kind: 'ledger' as const, id: l.id, when: l.occurred_at, ledger: l })),
    ...clinicCosts.map((c) => ({ kind: 'cost' as const, id: c.id, when: c.occurred_at, cost: c })),
  ].sort((a, b) => b.when.localeCompare(a.when))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'visits', label: 'Visits' },
    { key: 'medical', label: 'Medical history' },
    { key: 'notes', label: 'Clinical notes' },
    { key: 'teeth', label: 'Tooth chart' },
    { key: 'photos', label: 'Documents & X-rays' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'prescriptions', label: 'Prescriptions' },
    { key: 'letters', label: 'Letters' },
  ]

  const hasAlerts = allergies.length > 0 || conditions.length > 0 || patient.is_smoker
  const missingFields = missingRequiredPatientFields(patient, settings.required_fields)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-navy-900">
            {patientFullName(patient)}
            <PatientBadges patient={patient} elderlyAgeThreshold={settings.elderly_age_threshold} hasCondition={conditions.length > 0} incompleteFields={missingFields} />
          </h1>
          <p className="text-sm text-slate-500">
            {patient.file_number && <>File #{patient.file_number} · </>}
            {patient.phone}
          </p>
          {nextVisit && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              📅 Next appointment: {formatDateTime(nextVisit.scheduled_at)}
            </p>
          )}
        </div>
        {tab === 'info' && !editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50"
            >
              Edit patient
            </button>
            <RoleGate allow={['dentist']}>
              <button
                onClick={handleDeletePatient}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </RoleGate>
          </div>
        )}
      </div>

      {missingFields.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-orange-800">⚠ Incomplete file — missing info to ask the patient for</p>
            <p className="mt-1 text-sm text-orange-700">{missingFields.join(', ')}</p>
          </div>
          {!editing && (
            <button
              onClick={() => {
                setTab('info')
                setEditing(true)
              }}
              className="shrink-0 rounded-lg border border-orange-400 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-100"
            >
              Fill in now
            </button>
          )}
        </div>
      )}

      {hasAlerts && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">⚠ Medical alerts</p>
          <div className="mt-1 space-y-0.5 text-sm text-red-700">
            {allergies.length > 0 && (
              <p>
                <span className="font-medium">Allergies:</span> {allergies.map((a) => a.name).join(', ')}
              </p>
            )}
            {conditions.length > 0 && (
              <p>
                <span className="font-medium">Conditions:</span> {conditions.map((c) => c.condition).join(', ')}
              </p>
            )}
            {patient.is_smoker && <p className="font-medium">🚬 Smoker</p>}
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'border-gold-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' &&
        (editing ? (
          <PatientForm
            initial={patient}
            locations={locations}
            providers={providers}
            groups={groups}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={handleSaveEdit}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-navy-900">Personal info</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <p><span className="text-slate-500">Gender:</span> {patient.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : '—'}</p>
                <p><span className="text-slate-500">Date of birth:</span> {patient.date_of_birth ? `${formatDate(patient.date_of_birth)} (age ${calculateAge(patient.date_of_birth)})` : '—'}</p>
                <p><span className="text-slate-500">Marital status:</span> {patient.marital_status ?? '—'}</p>
                <p><span className="text-slate-500">Smoker:</span> {patient.is_smoker ? 'Yes 🚬' : 'No'}</p>
                <p><span className="text-slate-500">Nationality:</span> {patient.nationality ?? '—'}</p>
                <p><span className="text-slate-500">National ID:</span> {patient.national_id ?? '—'}</p>
                <p><span className="text-slate-500">Occupation:</span> {patient.occupation ?? '—'}</p>
                <p><span className="text-slate-500">Provider:</span> {patient.provider ? providerFullName(patient.provider) : '—'}</p>
                <p><span className="text-slate-500">Group:</span> {patient.group?.name ?? '—'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-navy-900">Contact info</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <p><span className="text-slate-500">Phone:</span> {patient.phone ?? '—'}</p>
                <p><span className="text-slate-500">Alternate phone:</span> {patient.phone_secondary ?? '—'}</p>
                <p className="sm:col-span-2"><span className="text-slate-500">Email:</span> {patient.email ?? '—'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-navy-900">Address</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <p><span className="text-slate-500">Country:</span> {patient.country ?? '—'}</p>
                <p><span className="text-slate-500">City:</span> {patient.city ?? '—'}</p>
                <p><span className="text-slate-500">District / area:</span> {patient.district ?? '—'}</p>
                <p><span className="text-slate-500">Street address:</span> {patient.address ?? '—'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-1 text-sm font-semibold text-navy-900">Notes</p>
              <p className="text-sm text-navy-800">{patient.notes ?? '—'}</p>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-sm font-medium text-navy-900">Medical conditions</p>
                {conditions.length === 0 ? (
                  <p className="text-sm text-slate-400">None recorded</p>
                ) : (
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-navy-800">
                    {conditions.map((c) => (
                      <li key={c.id}>{c.condition}{c.note ? ` — ${c.note}` : ''}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-navy-900">Medications</p>
                {medications.length === 0 ? (
                  <p className="text-sm text-slate-400">None recorded</p>
                ) : (
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-navy-800">
                    {medications.map((m) => (
                      <li key={m.id}>{m.name}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-navy-900">Allergies</p>
                {allergies.length === 0 ? (
                  <p className="text-sm text-slate-400">None recorded</p>
                ) : (
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-red-700">
                    {allergies.map((a) => (
                      <li key={a.id}>{a.name}{a.note ? ` — ${a.note}` : ''}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 sm:grid-cols-2">
              <p>Created on: {formatDateTime(patient.created_at)}</p>
              <p>Created by: {auditName(patient.created_by_profile) ?? '—'}</p>
              <p>Last edited on: {patient.updated_at ? formatDateTime(patient.updated_at) : '—'}</p>
              <p>Last edited by: {auditName(patient.updated_by_profile) ?? '—'}</p>
            </div>
          </div>
        ))}

      {tab === 'visits' && (
        <div className="space-y-4">
          <form onSubmit={handleNewVisit} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-sm text-slate-500">Schedule a visit</label>
              <input name="scheduled_at" type="datetime-local" required className="rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Provider{settings.visit_provider_required ? ' *' : ''}</label>
              <select name="provider_id" defaultValue={patient?.provider_id ?? ''} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">{settings.visit_provider_required ? '— Select a provider —' : 'No provider'}</option>
                {providers.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {providerFullName(pr)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Status</label>
              <select name="status" defaultValue="unconfirmed" className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="unconfirmed">Unconfirmed</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Add visit
            </button>
          </form>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {visits.length === 0 && <p className="p-4 text-sm text-slate-500">No visits yet.</p>}
            {visits.map((v) => {
              const isOpen = expandedVisitId === v.id
              return (
                <div key={v.id} className="border-b border-slate-100 last:border-0">
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                    <button
                      onClick={() => {
                        if (isOpen) {
                          setExpandedVisitId(null)
                        } else {
                          setExpandedVisitId(v.id)
                          setVisitNoteDraft(v.notes ?? '')
                          setVisitDurationDraft(v.duration_minutes)
                          setVisitWhenDraft(toDatetimeLocal(v.scheduled_at))
                        }
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p>
                        {formatDateTime(v.scheduled_at)} <span className="text-xs text-slate-400">({v.duration_minutes} min)</span>
                      </p>
                      {v.notes && !isOpen && <p className="mt-0.5 truncate text-xs text-slate-400">{v.notes}</p>}
                    </button>
                    <select
                      value={v.provider_id ?? ''}
                      onChange={(e) => handleChangeVisitProvider(v.id, e.target.value)}
                      title="Provider for this appointment"
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"
                    >
                      <option value="">No provider</option>
                      {providers.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {providerFullName(pr)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={v.status}
                      onChange={(e) => handleChangeVisitStatus(v.id, e.target.value as VisitStatus)}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${VISIT_STATUS_COLORS[v.status]}`}
                    >
                      {(Object.keys(VISIT_STATUS_LABELS) as VisitStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {VISIT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isOpen && (
                    <div className="space-y-2 px-4 pb-4">
                      <div className="flex flex-wrap gap-2">
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Date &amp; time</label>
                          <input
                            type="datetime-local"
                            value={visitWhenDraft}
                            onChange={(e) => setVisitWhenDraft(e.target.value)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Duration</label>
                          <select value={visitDurationDraft} onChange={(e) => setVisitDurationDraft(Number(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            {[15, 20, 30, 45, 60, 75, 90, 120, 180, 240, 300].map((n) => (
                              <option key={n} value={n}>
                                {n} min
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <textarea
                        value={visitNoteDraft}
                        onChange={(e) => setVisitNoteDraft(e.target.value)}
                        placeholder="Notes for this appointment"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveVisit(v.id)} className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                          Save changes
                        </button>
                        <button onClick={() => handleDeleteVisit(v.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                          Delete appointment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'medical' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-navy-900">
              <input type="checkbox" checked={patient.is_smoker} onChange={(e) => handleToggleSmoker(e.target.checked)} />
              <span>🚬 Smoker</span>
            </label>
            <span className="text-xs text-slate-400">Shows a cigarette marker next to the patient's name in the list.</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-navy-900">Medical conditions</h2>
            <form onSubmit={handleAddCondition} className="space-y-2">
              <input name="condition" list="condition-options" required placeholder="Search or type a condition…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <datalist id="condition-options">
                {conditionOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input name="note" placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                + Add condition
              </button>
            </form>
            <div className="divide-y divide-slate-100">
              {conditions.length === 0 && <p className="py-2 text-sm text-slate-500">No conditions recorded.</p>}
              {conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-medium text-navy-900">{c.condition}</p>
                    {c.note && <p className="text-xs text-slate-500">{c.note}</p>}
                  </div>
                  <button onClick={() => handleDeleteCondition(c.id)} className="shrink-0 text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-navy-900">Medications</h2>
            <form onSubmit={handleAddMedication} className="flex gap-2">
              <input name="name" required placeholder="e.g. Metformin 500mg" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="shrink-0 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                + Add
              </button>
            </form>
            <div className="divide-y divide-slate-100">
              {medications.length === 0 && <p className="py-2 text-sm text-slate-500">No medications recorded.</p>}
              {medications.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <p className="text-sm text-navy-900">{m.name}</p>
                  <button onClick={() => handleDeleteMedication(m.id)} className="shrink-0 text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-navy-900">Allergies</h2>
            <form onSubmit={handleAddAllergy} className="space-y-2">
              <input name="name" list="allergy-options" required placeholder="Search or type an allergy…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <datalist id="allergy-options">
                {COMMON_ALLERGIES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <input name="note" placeholder="Reaction / note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                + Add allergy
              </button>
            </form>
            <div className="divide-y divide-slate-100">
              {allergies.length === 0 && <p className="py-2 text-sm text-slate-500">No allergies recorded.</p>}
              {allergies.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-medium text-navy-900">{a.name}</p>
                    {a.note && <p className="text-xs text-slate-500">{a.note}</p>}
                  </div>
                  <button onClick={() => handleDeleteAllergy(a.id)} className="shrink-0 text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <RoleGate allow={['dentist']} fallback={<p className="text-sm text-slate-500">Clinical notes are visible to dentists only.</p>}>
          <div className="space-y-4">
            <form onSubmit={handleNewNote} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <textarea name="note" placeholder="Clinical note" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <textarea name="treatment_plan" placeholder="Treatment plan" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                Add note
              </button>
            </form>
            <div className="space-y-3">
              {records.length === 0 && <p className="text-sm text-slate-500">No clinical records yet.</p>}
              {records.map((r) => {
                const isEditing = editingRecordId === r.id
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        {formatDateTime(r.created_at)}
                        {r.updated_at && ` (edited ${formatDateTime(r.updated_at)})`}
                      </p>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingRecordId(r.id)
                            setRecordDraft({ note: r.note ?? '', treatment_plan: r.treatment_plan ?? '' })
                          }}
                          className="text-xs font-medium text-navy-700 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={recordDraft.note}
                          onChange={(e) => setRecordDraft((d) => ({ ...d, note: e.target.value }))}
                          placeholder="Clinical note"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <textarea
                          value={recordDraft.treatment_plan}
                          onChange={(e) => setRecordDraft((d) => ({ ...d, treatment_plan: e.target.value }))}
                          placeholder="Treatment plan"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRecordEdit(r.id)}
                            className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingRecordId(null)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {r.note && <p className="mb-2 text-navy-900">{r.note}</p>}
                        {r.treatment_plan && <p className="text-sm text-slate-600"><span className="font-medium">Plan:</span> {r.treatment_plan}</p>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </RoleGate>
      )}

      {tab === 'teeth' && (
        <RoleGate allow={['dentist']} fallback={<p className="text-sm text-slate-500">The tooth chart is visible to dentists only.</p>}>
          {id && <ToothChart patientId={id} />}
        </RoleGate>
      )}

      {tab === 'photos' && (
        <RoleGate allow={['dentist']} fallback={<p className="text-sm text-slate-500">Documents are visible to dentists only.</p>}>
          <div className="space-y-4">
            <form onSubmit={handleUploadPhoto} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Category</label>
                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {DOC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">File (image or PDF)</label>
                <input name="file" type="file" accept="image/*,application/pdf" required className="text-sm" />
              </div>
              <input name="note" placeholder="Note (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                Upload
              </button>
            </form>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.length === 0 && <p className="text-sm text-slate-500">No documents yet.</p>}
              {photos.map((p) => {
                const isImage = isImagePath(p.storage_path)
                const thumb = photoThumbs[p.id]
                return (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <button onClick={() => handleViewDocument(p.storage_path)} className="flex h-24 w-full items-center justify-center bg-slate-50 hover:bg-slate-100">
                      {isImage && thumb ? (
                        <img src={thumb} alt={p.label ?? 'Document'} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-3xl">{isImage ? '🖼️' : '📄'}</span>
                      )}
                    </button>
                    <div className="p-2 text-center text-xs">
                      <p className="truncate font-medium text-navy-800">{p.label ?? 'Document'}</p>
                      <p className="text-slate-400">{formatDate(p.created_at)}</p>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <button onClick={() => handleViewDocument(p.storage_path)} className="text-navy-700 hover:underline">
                          View
                        </button>
                        <button onClick={() => handleDeletePhoto(p)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </RoleGate>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm text-slate-500">Outstanding balance</p>
              <p className={`text-2xl font-semibold ${balance > 0 ? 'text-gold-600' : 'text-navy-900'}`}>{money(balance)}</p>
            </div>
            <button
              onClick={() => exportLedgerStatementPdf(patient, ledger)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50"
            >
              Export statement (PDF)
            </button>
          </div>

          <form onSubmit={handleAddTransaction} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Type</label>
              <select value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="payment">Payment (in)</option>
                <option value="charge">Charge (owed)</option>
                <option value="discount">Discount (off the bill)</option>
                {isDentist && <option value="provider_fee">Provider fee (cost)</option>}
                {isDentist && <option value="lab_fee">Lab fee (cost)</option>}
              </select>
            </div>
            {txType === 'provider_fee' && (
              <div>
                <label className="mb-1 block text-xs text-slate-500">Provider</label>
                <select name="provider_id" defaultValue={patient.provider_id ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Select provider</option>
                  {providers.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {providerFullName(pr)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-slate-500">Amount ({settings.currency})</label>
              <input name="amount" type="number" step="0.01" min="0" required className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className="mb-1 block text-xs text-slate-500">Description</label>
              <input name="description" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            {(txType === 'payment' || txType === 'provider_fee' || txType === 'lab_fee') && (
              <div>
                <label className="mb-1 block text-xs text-slate-500">Method</label>
                <select name="payment_method" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-slate-500">Date &amp; time</label>
              <input name="occurred_at" type="datetime-local" defaultValue={nowLocalDatetimeValue()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Add
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {cashflow.length === 0 && <p className="p-4 text-sm text-slate-500">No transactions yet.</p>}
            {cashflow.map((row) =>
              row.kind === 'ledger' ? (
                editingLedgerId === row.ledger.id ? (
                  <form key={`l-${row.ledger.id}`} onSubmit={(e) => handleSaveLedgerEdit(e, row.ledger)} className="space-y-2 border-b border-slate-100 px-4 py-3 last:border-0">
                    <p className="text-sm font-medium text-navy-900">Edit {LEDGER_LABELS[row.ledger.entry_type].toLowerCase()}</p>
                    <input name="description" defaultValue={row.ledger.description ?? ''} placeholder="Description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input name="amount" type="number" step="0.01" min="0" required defaultValue={row.ledger.amount} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    {row.ledger.entry_type === 'payment' && (
                      <select name="payment_method" defaultValue={row.ledger.payment_method ?? 'cash'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    )}
                    <input name="occurred_at" type="datetime-local" defaultValue={toDatetimeLocal(row.ledger.occurred_at)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingLedgerId(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div key={`l-${row.ledger.id}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="text-navy-900">
                        <span
                          className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                            row.ledger.entry_type === 'discount' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {LEDGER_LABELS[row.ledger.entry_type]}
                        </span>
                        {row.ledger.description || LEDGER_LABELS[row.ledger.entry_type]}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(row.ledger.occurred_at)} {row.ledger.payment_method ? `· ${PAYMENT_METHOD_LABELS[row.ledger.payment_method]}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p
                        className={
                          row.ledger.entry_type === 'charge'
                            ? 'font-medium text-navy-900'
                            : row.ledger.entry_type === 'discount'
                            ? 'font-medium text-amber-600'
                            : 'font-medium text-green-600'
                        }
                      >
                        {row.ledger.entry_type === 'discount' ? '−' : '+'}
                        {money(Number(row.ledger.amount))}
                      </p>
                      {row.ledger.entry_type === 'payment' && (
                        <button onClick={() => exportPaymentReceiptPdf(patient, row.ledger, settings.currency)} className="text-xs font-medium text-navy-700 hover:underline">
                          Receipt
                        </button>
                      )}
                      <button onClick={() => setEditingLedgerId(row.ledger.id)} className="text-xs font-medium text-navy-700 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteLedgerEntry(row.ledger.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>
                )
              ) : editingCostId === row.cost.id ? (
                <form key={`c-${row.cost.id}`} onSubmit={(e) => handleSaveClinicCostEdit(e, row.cost)} className="space-y-2 border-b border-slate-100 px-4 py-3 last:border-0">
                  <p className="text-sm font-medium text-navy-900">Edit {row.cost.expense_type === 'provider_fee' ? 'provider fee' : 'lab fee'}</p>
                  {row.cost.expense_type === 'provider_fee' && (
                    <select name="provider_id" defaultValue={row.cost.provider_id ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Select provider</option>
                      {providers.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {providerFullName(pr)}
                        </option>
                      ))}
                    </select>
                  )}
                  <input name="description" defaultValue={row.cost.description ?? ''} placeholder="Description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input name="amount" type="number" step="0.01" min="0" required defaultValue={row.cost.amount} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <select name="payment_method" defaultValue={row.cost.payment_method ?? 'cash'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <input name="occurred_at" type="datetime-local" defaultValue={toDatetimeLocal(row.cost.occurred_at)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingCostId(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div key={`c-${row.cost.id}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-navy-900">
                      <span className="mr-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-600">{row.cost.expense_type === 'provider_fee' ? 'Provider fee' : 'Lab fee'}</span>
                      {row.cost.provider ? providerFullName(row.cost.provider) : row.cost.description && row.cost.description !== 'Provider fee' && row.cost.description !== 'Lab fee' ? row.cost.description : row.cost.expense_type === 'provider_fee' ? 'Provider fee' : 'Lab fee'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(row.cost.occurred_at)} {row.cost.payment_method ? `· ${PAYMENT_METHOD_LABELS[row.cost.payment_method]}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-medium text-red-600">−{money(Number(row.cost.amount))}</p>
                    <button onClick={() => setEditingCostId(row.cost.id)} className="text-xs font-medium text-navy-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteClinicCost(row.cost.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-navy-900">New prescription</h2>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-slate-500">Prescriber</label>
              <input
                value={rxPrescriber}
                onChange={(e) => setRxPrescriber(e.target.value)}
                placeholder="Doctor's name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
              />
            </div>

            <div className="space-y-2">
              {rxItems.map((it, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input value={it.drug} onChange={(e) => updateRx(i, 'drug', e.target.value)} placeholder="Medication *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
                    <input value={it.dosage} onChange={(e) => updateRx(i, 'dosage', e.target.value)} placeholder="Dosage (e.g. 500 mg)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={it.frequency} onChange={(e) => updateRx(i, 'frequency', e.target.value)} placeholder="Frequency (e.g. 3×/day)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={it.duration} onChange={(e) => updateRx(i, 'duration', e.target.value)} placeholder="Duration (e.g. 5 days)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input value={it.instructions} onChange={(e) => updateRx(i, 'instructions', e.target.value)} placeholder="Instructions (e.g. after meals)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
                  </div>
                  {rxItems.length > 1 && (
                    <button onClick={() => setRxItems((items) => items.filter((_, idx) => idx !== i))} className="mt-2 text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setRxItems((items) => [...items, { ...EMPTY_RX }])} className="mt-2 text-sm font-medium text-navy-700 hover:underline">
              + Add another medication
            </button>

            <div className="mt-3">
              <label className="mb-1 block text-xs text-slate-500">Notes (optional)</label>
              <textarea value={rxNotes} onChange={(e) => setRxNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </div>

            <button onClick={handleSavePrescription} className="mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
              Save &amp; print (PDF)
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-navy-900">Past prescriptions</p>
            {prescriptions.length === 0 && <p className="p-4 text-sm text-slate-500">No prescriptions yet.</p>}
            {prescriptions.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900">
                    {formatDate(p.created_at)}
                    {p.prescriber_name ? ` · ${p.prescriber_name}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(p.items || []).map((it) => [it.drug, it.dosage, it.frequency, it.duration].filter(Boolean).join(' ')).join('  |  ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => reprintPrescription(p)} className="text-xs font-medium text-navy-700 hover:underline">
                    Print
                  </button>
                  <button onClick={() => handleDeletePrescription(p.id)} className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'letters' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-navy-900">New letter</h2>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Letter type</label>
                <select
                  value={letterTemplateKey}
                  onChange={(e) => {
                    setLetterTemplateKey(e.target.value)
                    setLetterValues({})
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {['Referral', 'Medical report', 'Administrative'].map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {LETTER_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Signed by</label>
                <input
                  value={letterAuthor}
                  onChange={(e) => setLetterAuthor(e.target.value)}
                  placeholder="Doctor's name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {(() => {
              const template = getLetterTemplate(letterTemplateKey)
              if (!template) return null
              return (
                <div className="space-y-3">
                  {template.fields.map((f) => {
                    const value = letterValues[f.key] ?? f.defaultValue ?? ''
                    if (f.type === 'textarea')
                      return (
                        <div key={f.key}>
                          <label className="mb-1 block text-xs text-slate-500">
                            {f.label}
                            {f.required ? ' *' : ''}
                          </label>
                          <textarea
                            value={value}
                            onChange={(e) => updateLetterField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            rows={f.key === 'body' ? 8 : 3}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                      )
                    if (f.type === 'select')
                      return (
                        <div key={f.key}>
                          <label className="mb-1 block text-xs text-slate-500">
                            {f.label}
                            {f.required ? ' *' : ''}
                          </label>
                          <select
                            value={value}
                            onChange={(e) => updateLetterField(f.key, e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
                          >
                            <option value="">— Select —</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                          {f.allowOther && value === OTHER_OPTION && (
                            <input
                              autoFocus
                              value={letterValues[`${f.key}__other`] ?? ''}
                              onChange={(e) => updateLetterField(`${f.key}__other`, e.target.value)}
                              placeholder="Please specify…"
                              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
                            />
                          )}
                        </div>
                      )
                    return (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs text-slate-500">
                          {f.label}
                          {f.required ? ' *' : ''}
                        </label>
                        <input
                          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                          value={value}
                          onChange={(e) => updateLetterField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <button onClick={handleSaveLetter} className="mt-4 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
              Save &amp; print (PDF)
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-navy-900">Past letters</p>
            {letters.length === 0 && <p className="p-4 text-sm text-slate-500">No letters yet.</p>}
            {letters.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900">{l.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(l.created_at)}
                    {l.author_name ? ` · ${l.author_name}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => reprintLetter(l)} className="text-xs font-medium text-navy-700 hover:underline">
                    Print
                  </button>
                  <button onClick={() => handleDeleteLetter(l.id)} className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
