import { useEffect, useId, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  ToothProcedure,
  ToothDiagnosis,
  ToothSurface,
  ALL_SURFACES,
  SURFACE_LABELS,
  ChartScope,
  CHART_SCOPE_LABELS,
  ChartStatus,
  CHART_STATUS_LABELS,
  CHART_STATUS_COLORS,
  DiagnosisCondition,
  DIAGNOSIS_CONDITION_LABELS,
  DIAGNOSIS_CONDITION_COLORS,
  Procedure,
  ProcedureCategory,
  Provider,
  providerFullName,
} from '../types'
import { formatDate } from '../lib/dates'
import { UPPER_ROW, LOWER_ROW, ALL_TEETH, SEXTANTS, ARCHES, expandScopeToTeeth, describeScope, toothType, CROWN_W, CROWN_H, ROOT_H, CROWN_PATHS, ROOT_PATHS } from '../lib/dentalChart'

type Mode = 'diagnosis' | 'treatment'

// ---------------------------------------------------------------------------
// A single tooth as an anatomically-shaped icon: crown (the tooth-type outline,
// e.g. a pointed canine vs a broad molar) subdivided into its 5 surfaces, plus
// a decorative root below. Upper-row teeth reuse the same paths flipped
// vertically, so the root always points toward the jaw and the crown toward
// the bite line, same trick the flat version used.
// ---------------------------------------------------------------------------
function ToothDiagram({
  tooth,
  orientation,
  surfaceColors,
  baseColor = '#ffffff',
  selectable,
  selectedSurfaces,
  onToggleSurface,
  showRoot = true,
  scale = 0.62,
}: {
  tooth: number
  orientation: 'upper' | 'lower'
  surfaceColors: Partial<Record<ToothSurface, string>>
  baseColor?: string
  selectable?: boolean
  selectedSurfaces?: Set<ToothSurface>
  onToggleSurface?: (s: ToothSurface) => void
  showRoot?: boolean
  scale?: number
}) {
  const clipId = useId()
  const type = toothType(tooth)
  const crownPath = CROWN_PATHS[type]
  const rootPaths = ROOT_PATHS[type]
  const totalH = CROWN_H + (showRoot ? ROOT_H : 0)
  const cellW = CROWN_W / 3
  const cellH = CROWN_H / 3
  const regions: { key: ToothSurface; x: number; y: number }[] = [
    { key: 'M', x: cellW, y: 0 },
    { key: 'B', x: 0, y: cellH },
    { key: 'O', x: cellW, y: cellH },
    { key: 'L', x: 2 * cellW, y: cellH },
    { key: 'D', x: cellW, y: 2 * cellH },
  ]
  const corners: [number, number][] = [
    [0, 0],
    [2 * cellW, 0],
    [0, 2 * cellH],
    [2 * cellW, 2 * cellH],
  ]

  return (
    <svg
      width={CROWN_W * scale}
      height={totalH * scale}
      viewBox={`0 0 ${CROWN_W} ${totalH}`}
      style={orientation === 'upper' ? { transform: 'scaleY(-1)' } : undefined}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={crownPath} />
        </clipPath>
      </defs>
      <path d={crownPath} fill={baseColor} stroke="#94a3b8" strokeWidth={1} />
      <g clipPath={`url(#${clipId})`}>
        {corners.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={cellW} height={cellH} fill={baseColor} />
        ))}
        {regions.map((r) => {
          const selected = selectedSurfaces?.has(r.key)
          const fill = surfaceColors[r.key] ?? baseColor
          return (
            <rect
              key={r.key}
              x={r.x}
              y={r.y}
              width={cellW}
              height={cellH}
              fill={fill}
              stroke={selected ? '#0f172a' : 'rgba(148,163,184,0.5)'}
              strokeWidth={selected ? 1.5 : 0.4}
              onClick={selectable ? () => onToggleSurface?.(r.key) : undefined}
              style={selectable ? { cursor: 'pointer' } : undefined}
            />
          )
        })}
      </g>
      {showRoot &&
        rootPaths.map((p, i) => <path key={i} d={p} fill="#f3ecd9" stroke="#cbd5e1" strokeWidth={0.75} />)}
    </svg>
  )
}

type DiagColorMap = Record<number, Partial<Record<ToothSurface, string>>>

function buildDiagnosisColors(diags: ToothDiagnosis[]): DiagColorMap {
  const map: DiagColorMap = {}
  for (const d of diags.filter((x) => x.active)) {
    const color = DIAGNOSIS_CONDITION_COLORS[d.condition]
    const surfaces = d.surfaces.length > 0 ? d.surfaces : ALL_SURFACES
    const cur = map[d.tooth] ?? {}
    for (const s of surfaces) cur[s] = color
    map[d.tooth] = cur
  }
  return map
}

type StatusColorMap = Record<number, Partial<Record<ToothSurface, string>>>

function buildStatusColors(entries: ToothProcedure[]): StatusColorMap {
  const map: StatusColorMap = {}
  for (const e of entries) {
    const color = CHART_STATUS_COLORS[e.status]
    const surfaces = e.scope === 'surface' || e.scope === 'multi_surface' ? e.surfaces : ALL_SURFACES
    for (const tooth of e.teeth) {
      const cur = map[tooth] ?? {}
      for (const s of surfaces) cur[s] = color
      map[tooth] = cur
    }
  }
  return map
}

export default function ToothChart({ patientId }: { patientId: string }) {
  const [mode, setMode] = useState<Mode>('diagnosis')
  const [diagnoses, setDiagnoses] = useState<ToothDiagnosis[]>([])
  const [entries, setEntries] = useState<ToothProcedure[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [categories, setCategories] = useState<ProcedureCategory[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  // ---- Diagnosis panel ----
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagEditingId, setDiagEditingId] = useState<string | null>(null)
  const [diagTooth, setDiagTooth] = useState<number | null>(null)
  const [diagWholeTooth, setDiagWholeTooth] = useState(false)
  const [diagSurfaces, setDiagSurfaces] = useState<Set<ToothSurface>>(new Set())
  const [diagCondition, setDiagCondition] = useState<DiagnosisCondition>('decayed')
  const [diagNote, setDiagNote] = useState('')
  const [diagSaving, setDiagSaving] = useState(false)

  // ---- Treatment panel ----
  const [txOpen, setTxOpen] = useState(false)
  const [txEditingId, setTxEditingId] = useState<string | null>(null)
  const [procedureId, setProcedureId] = useState('')
  const [scope, setScope] = useState<ChartScope>('whole_tooth')
  const [pickTeeth, setPickTeeth] = useState<Set<number>>(new Set())
  const [pickTooth, setPickTooth] = useState<number | ''>('')
  const [pickSurfaces, setPickSurfaces] = useState<Set<ToothSurface>>(new Set())
  const [sextantKey, setSextantKey] = useState(SEXTANTS[0].key)
  const [archKey, setArchKey] = useState<'upper' | 'lower'>('upper')
  const [txStatus, setTxStatus] = useState<ChartStatus>('planned')
  const [txProviderId, setTxProviderId] = useState('')
  const [txNote, setTxNote] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [txSaving, setTxSaving] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  async function load() {
    setLoading(true)
    const [{ data: diags }, { data: tp }, { data: procs }, { data: cats }, { data: provs }] = await Promise.all([
      supabase.from('tooth_diagnoses').select('*').eq('patient_id', patientId).order('diagnosed_at', { ascending: true }),
      supabase.from('tooth_procedures').select('*').eq('patient_id', patientId).order('created_at', { ascending: true }),
      supabase.from('procedures').select('*, category:procedure_categories(name)').eq('active', true).order('name'),
      supabase.from('procedure_categories').select('*').eq('active', true).order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
    ])
    setDiagnoses((diags as ToothDiagnosis[]) ?? [])
    setEntries((tp as ToothProcedure[]) ?? [])
    setProcedures((procs as Procedure[]) ?? [])
    setCategories((cats as ProcedureCategory[]) ?? [])
    setProviders((provs as Provider[]) ?? [])
    setLoading(false)
  }

  const diagnosisColors = useMemo(() => buildDiagnosisColors(diagnoses), [diagnoses])
  const statusColors = useMemo(() => buildStatusColors(entries), [entries])
  const surfaceColorsFor = (n: number) => (mode === 'diagnosis' ? diagnosisColors[n] ?? {} : statusColors[n] ?? {})

  // ---------------- Diagnosis mode ----------------
  // "Armed" condition = fast bulk mode: press a condition below the chart, then
  // click through teeth to toggle that whole-tooth finding on/off, no dialog.
  const [armedCondition, setArmedCondition] = useState<DiagnosisCondition | null>(null)

  function toggleArmed(c: DiagnosisCondition) {
    setDiagOpen(false)
    setArmedCondition((cur) => (cur === c ? null : c))
  }

  async function handleArmedToothClick(tooth: number) {
    if (!armedCondition) return
    const existing = diagnoses.find((d) => d.tooth === tooth && d.active && d.surfaces.length === 0 && d.condition === armedCondition)
    if (existing) {
      const { error } = await supabase.from('tooth_diagnoses').update({ active: false, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) return alert(error.message)
      setDiagnoses((cur) => cur.map((d) => (d.id === existing.id ? { ...d, active: false } : d)))
    } else {
      const { data, error } = await supabase
        .from('tooth_diagnoses')
        .insert({ patient_id: patientId, tooth, surfaces: [], condition: armedCondition, note: null, source: 'manual' })
        .select()
        .single()
      if (error) return alert(error.message)
      setDiagnoses((cur) => [...cur, data as ToothDiagnosis])
    }
  }

  function openDiagnosisPanel(tooth: number, surface?: ToothSurface) {
    setDiagEditingId(null)
    setDiagTooth(tooth)
    setDiagWholeTooth(!surface)
    setDiagSurfaces(surface ? new Set([surface]) : new Set())
    setDiagCondition('decayed')
    setDiagNote('')
    setDiagOpen(true)
  }
  function openEditDiagnosis(d: ToothDiagnosis) {
    setDiagEditingId(d.id)
    setDiagTooth(d.tooth)
    setDiagWholeTooth(d.surfaces.length === 0)
    setDiagSurfaces(new Set(d.surfaces))
    setDiagCondition(d.condition)
    setDiagNote(d.note ?? '')
    setDiagOpen(true)
  }
  function toggleDiagSurface(s: ToothSurface) {
    setDiagSurfaces((cur) => {
      const next = new Set(cur)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }
  async function handleSaveDiagnosis() {
    if (diagTooth === null) return
    if (!diagWholeTooth && diagSurfaces.size === 0) return alert('Pick at least one surface, or check "whole tooth".')
    setDiagSaving(true)
    const payload = {
      patient_id: patientId,
      tooth: diagTooth,
      surfaces: diagWholeTooth ? [] : Array.from(diagSurfaces),
      condition: diagCondition,
      note: diagNote || null,
      source: 'manual' as const,
      updated_at: new Date().toISOString(),
    }
    const { error } = diagEditingId ? await supabase.from('tooth_diagnoses').update(payload).eq('id', diagEditingId) : await supabase.from('tooth_diagnoses').insert(payload)
    setDiagSaving(false)
    if (error) alert(error.message)
    else {
      setDiagOpen(false)
      load()
    }
  }
  async function handleResolveDiagnosis(d: ToothDiagnosis) {
    const { error } = await supabase.from('tooth_diagnoses').update({ active: false, updated_at: new Date().toISOString() }).eq('id', d.id)
    if (error) alert(error.message)
    else load()
  }
  async function handleDeleteDiagnosis(id: string) {
    if (!confirm('Delete this diagnosis entry? This cannot be undone.')) return
    const { error } = await supabase.from('tooth_diagnoses').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  // ---------------- Treatment mode ----------------
  function openTreatmentPanel(tooth?: number, surface?: ToothSurface) {
    setTxEditingId(null)
    setProcedureId('')
    setScope('whole_tooth')
    setPickTeeth(tooth ? new Set([tooth]) : new Set())
    setPickTooth(tooth ?? '')
    setPickSurfaces(surface ? new Set([surface]) : new Set())
    setSextantKey(SEXTANTS[0].key)
    setArchKey('upper')
    setTxStatus('planned')
    setTxProviderId('')
    setTxNote('')
    setTxPrice('')
    setTxOpen(true)
  }
  function openEditEntry(e: ToothProcedure) {
    setTxEditingId(e.id)
    setProcedureId(e.procedure_id ?? '')
    setScope(e.scope)
    setPickTeeth(new Set(e.teeth))
    setPickTooth(e.teeth[0] ?? '')
    setPickSurfaces(new Set(e.surfaces))
    setTxStatus(e.status)
    setTxProviderId(e.provider_id ?? '')
    setTxNote(e.note ?? '')
    setTxPrice(e.price != null ? String(e.price) : '')
    setTxOpen(true)
  }
  function pickProcedure(id: string) {
    setProcedureId(id)
    const p = procedures.find((x) => x.id === id)
    if (p) {
      setScope(p.default_scope)
      if (p.default_price != null) setTxPrice(String(p.default_price))
      if (p.default_scope === 'whole_tooth' && pickTooth && pickTeeth.size === 0) setPickTeeth(new Set([pickTooth as number]))
    }
  }
  function toggleTxSurface(s: ToothSurface) {
    setPickSurfaces((cur) => {
      const next = new Set(cur)
      if (scope === 'surface') return next.has(s) ? new Set() : new Set([s])
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }
  function toggleWholeTooth(n: number) {
    setPickTeeth((cur) => {
      const next = new Set(cur)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  /** After a treatment is marked completed, reflect it in Diagnosis mode (if the procedure has a configured "results in" condition). Idempotent — skips if already linked from this entry. */
  async function autoLinkDiagnosis(entryId: string, teeth: number[], surfaces: ToothSurface[], scope: ChartScope, procId: string | null) {
    const proc = procedures.find((p) => p.id === procId)
    if (!proc?.results_in_condition) return
    const { data: already } = await supabase.from('tooth_diagnoses').select('id').eq('source_tooth_procedure_id', entryId).eq('active', true).limit(1)
    if (already && already.length > 0) return

    const wholeTooth = scope !== 'surface' && scope !== 'multi_surface'
    for (const tooth of teeth) {
      // Superseded: any existing active diagnosis on this tooth that overlaps the treated surfaces is now out of date.
      const { data: existing } = await supabase.from('tooth_diagnoses').select('id, surfaces').eq('patient_id', patientId).eq('tooth', tooth).eq('active', true)
      const toResolve = (existing ?? []).filter((d: any) => wholeTooth || d.surfaces.length === 0 || d.surfaces.some((s: string) => surfaces.includes(s as ToothSurface)))
      if (toResolve.length > 0) await supabase.from('tooth_diagnoses').update({ active: false }).in('id', toResolve.map((d: any) => d.id))
      await supabase.from('tooth_diagnoses').insert({
        patient_id: patientId,
        tooth,
        surfaces: wholeTooth ? [] : surfaces,
        condition: proc.results_in_condition,
        note: `Auto-set after completing "${proc.name}"`,
        source: 'auto',
        source_tooth_procedure_id: entryId,
      })
    }
  }

  async function handleSaveTreatment() {
    const proc = procedures.find((p) => p.id === procedureId)
    const existing = txEditingId ? entries.find((e) => e.id === txEditingId) : undefined
    const procedureName = proc?.name ?? existing?.procedure_name
    if (!txEditingId && !proc) return alert('Please choose a procedure.')

    let teeth: number[] = existing?.teeth ?? []
    let surfaces: ToothSurface[] = existing?.surfaces ?? []
    if (!txEditingId) {
      if (scope === 'surface' || scope === 'multi_surface') {
        if (!pickTooth) return alert('Please choose a tooth.')
        if (pickSurfaces.size === 0) return alert('Please choose at least one surface.')
        teeth = [pickTooth as number]
        surfaces = Array.from(pickSurfaces)
      } else if (scope === 'whole_tooth') {
        if (pickTeeth.size === 0) return alert('Please choose at least one tooth.')
        teeth = Array.from(pickTeeth)
      } else {
        teeth = expandScopeToTeeth(scope, { sextantKey, archKey })
      }
    }

    setTxSaving(true)
    const priceVal = txPrice ? Number(txPrice) : null
    let savedId = txEditingId
    if (txEditingId) {
      const { error } = await supabase
        .from('tooth_procedures')
        .update({ status: txStatus, provider_id: txProviderId || null, note: txNote || null, price: priceVal, updated_at: new Date().toISOString() })
        .eq('id', txEditingId)
      if (error) {
        setTxSaving(false)
        return alert(error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('tooth_procedures')
        .insert({
          patient_id: patientId,
          procedure_id: proc?.id ?? null,
          procedure_name: procedureName,
          scope,
          teeth,
          surfaces,
          status: txStatus,
          provider_id: txProviderId || null,
          note: txNote || null,
          price: priceVal,
        })
        .select()
        .single()
      if (error) {
        setTxSaving(false)
        return alert(error.message)
      }
      savedId = (data as ToothProcedure).id
    }

    if (txStatus === 'completed' && savedId) {
      await autoLinkDiagnosis(savedId, teeth, surfaces, scope, proc?.id ?? existing?.procedure_id ?? null)
    }

    setTxSaving(false)
    setTxOpen(false)
    load()
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this chart entry? This cannot be undone.')) return
    const { error } = await supabase.from('tooth_procedures').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  function handleToothClick(n: number, surface?: ToothSurface) {
    if (mode === 'diagnosis') {
      if (armedCondition) handleArmedToothClick(n)
      else openDiagnosisPanel(n, surface)
    } else openTreatmentPanel(n, surface)
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  const groupedProcedures = categories.map((c) => ({ category: c, items: procedures.filter((p) => p.category_id === c.id) }))
  const uncategorized = procedures.filter((p) => !p.category_id)
  const diagsForTooth = (n: number) => diagnoses.filter((d) => d.tooth === n).slice().reverse()
  const entriesForTooth = (n: number) => entries.filter((e) => e.teeth.includes(n)).slice().reverse()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 text-sm">
        <button
          onClick={() => setMode('diagnosis')}
          className={`rounded-md px-4 py-1.5 font-medium ${mode === 'diagnosis' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
        >
          🩺 Diagnosis
        </button>
        <button
          onClick={() => {
            setArmedCondition(null)
            setMode('treatment')
          }}
          className={`rounded-md px-4 py-1.5 font-medium ${mode === 'treatment' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
        >
          📋 Treatment plan
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs text-slate-500">
          Upper arch
          {mode === 'diagnosis'
            ? armedCondition
              ? ` — click any tooth to mark it "${DIAGNOSIS_CONDITION_LABELS[armedCondition]}".`
              : ' — click a surface to record a finding, or the number for the whole tooth.'
            : ' — click a surface to chart a procedure, or the number for the whole tooth.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {UPPER_ROW.map((n) => (
            <div key={n} className="flex flex-col items-center gap-0.5">
              <ToothDiagram tooth={n} orientation="upper" surfaceColors={surfaceColorsFor(n)} selectable onToggleSurface={(s) => handleToothClick(n, s)} />
              <button onClick={() => handleToothClick(n)} className="text-[10px] font-medium text-sky-600 hover:underline">
                {n}
              </button>
            </div>
          ))}
        </div>
        <div className="my-4 border-t border-dashed border-slate-200" />
        <div className="flex flex-wrap justify-center gap-2">
          {LOWER_ROW.map((n) => (
            <div key={n} className="flex flex-col items-center gap-0.5">
              <button onClick={() => handleToothClick(n)} className="text-[10px] font-medium text-sky-600 hover:underline">
                {n}
              </button>
              <ToothDiagram tooth={n} orientation="lower" surfaceColors={surfaceColorsFor(n)} selectable onToggleSurface={(s) => handleToothClick(n, s)} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Lower arch</p>
      </div>

      {mode === 'diagnosis' ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(Object.keys(DIAGNOSIS_CONDITION_LABELS) as DiagnosisCondition[]).map((c) => (
              <button
                key={c}
                onClick={() => toggleArmed(c)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition ${
                  armedCondition === c ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: DIAGNOSIS_CONDITION_COLORS[c] }} />
                {DIAGNOSIS_CONDITION_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {armedCondition ? (
              <>
                <span className="font-medium text-navy-800">{DIAGNOSIS_CONDITION_LABELS[armedCondition]}</span> is armed — click every tooth that has it (click again to remove). Press the pill again when
                done.
              </>
            ) : (
              'Press a condition above, then click through the teeth that have it. Or click a specific tooth/surface on the chart for finer detail (notes, one surface only, etc.).'
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {(Object.keys(CHART_STATUS_LABELS) as ChartStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: CHART_STATUS_COLORS[s] }} />
              {CHART_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      )}

      {/* ---------------- Diagnosis panel ---------------- */}
      {diagOpen && diagTooth !== null && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-medium text-navy-900">{diagEditingId ? 'Edit diagnosis' : 'New diagnosis'} — tooth {diagTooth}</p>
          <label className="flex items-center gap-2 text-sm text-navy-800">
            <input type="checkbox" checked={diagWholeTooth} onChange={(e) => setDiagWholeTooth(e.target.checked)} />
            Whole tooth
          </label>
          {!diagWholeTooth && (
            <div className="flex flex-wrap gap-1.5">
              {ALL_SURFACES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleDiagSurface(s)}
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${diagSurfaces.has(s) ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {SURFACE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
          <select value={diagCondition} onChange={(e) => setDiagCondition(e.target.value as DiagnosisCondition)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {(Object.keys(DIAGNOSIS_CONDITION_LABELS) as DiagnosisCondition[]).map((c) => (
              <option key={c} value={c}>
                {DIAGNOSIS_CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
          <textarea value={diagNote} onChange={(e) => setDiagNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSaveDiagnosis} disabled={diagSaving} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {diagSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setDiagOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">History on this tooth</p>
            {diagsForTooth(diagTooth).length === 0 ? (
              <p className="text-xs text-slate-400">None yet.</p>
            ) : (
              <div className="space-y-1">
                {diagsForTooth(diagTooth).map((d) => (
                  <div key={d.id} className={`flex items-center justify-between gap-2 text-xs ${!d.active ? 'text-slate-400 line-through' : ''}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300" style={{ backgroundColor: DIAGNOSIS_CONDITION_COLORS[d.condition] }} />
                      {DIAGNOSIS_CONDITION_LABELS[d.condition]} — {d.surfaces.length ? d.surfaces.join(', ') : 'whole tooth'}
                      {d.source === 'auto' && <span className="text-slate-400"> (auto)</span>}
                    </span>
                    {d.active && (
                      <span className="flex shrink-0 gap-2">
                        <button onClick={() => openEditDiagnosis(d)} className="text-navy-700 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => handleResolveDiagnosis(d)} className="text-amber-600 hover:underline">
                          Resolve
                        </button>
                        <button onClick={() => handleDeleteDiagnosis(d.id)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Treatment panel ---------------- */}
      {txOpen && (
        <div className="space-y-3 rounded-xl border border-gold-300 bg-gold-50/40 p-4">
          <p className="font-medium text-navy-900">{txEditingId ? 'Edit charted procedure' : 'Chart a new procedure'}</p>

          {!txEditingId && (
            <>
              <select value={procedureId} onChange={(e) => pickProcedure(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Select a procedure —</option>
                {groupedProcedures.map(
                  ({ category, items }) =>
                    items.length > 0 && (
                      <optgroup key={category.id} label={category.name}>
                        {items.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    ),
                )}
                {uncategorized.length > 0 && (
                  <optgroup label="Uncategorized">
                    {uncategorized.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {procedureId && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Area affected</label>
                  <select value={scope} onChange={(e) => setScope(e.target.value as ChartScope)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {(Object.keys(CHART_SCOPE_LABELS) as ChartScope[]).map((s) => (
                      <option key={s} value={s}>
                        {CHART_SCOPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procedureId && (scope === 'surface' || scope === 'multi_surface') && (
                <div className="space-y-2">
                  <label className="mb-1 block text-xs text-slate-500">Tooth</label>
                  <select
                    value={pickTooth}
                    onChange={(e) => {
                      setPickTooth(e.target.value ? Number(e.target.value) : '')
                      setPickSurfaces(new Set())
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                  >
                    <option value="">— Select a tooth —</option>
                    {ALL_TEETH.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  {pickTooth && (
                    <div className="flex items-center gap-3">
                      <ToothDiagram tooth={pickTooth as number} orientation="lower" surfaceColors={{}} selectable selectedSurfaces={pickSurfaces} onToggleSurface={toggleTxSurface} scale={1.8} />
                      <div className="text-xs text-slate-500">
                        {scope === 'surface' ? 'Click one surface.' : 'Click one or more surfaces.'}
                        {pickSurfaces.size > 0 && <p className="mt-1 font-medium text-navy-800">{Array.from(pickSurfaces).map((s) => SURFACE_LABELS[s]).join(', ')}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {procedureId && scope === 'whole_tooth' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Tooth (or teeth)</label>
                  <div className="flex flex-wrap gap-1">
                    {ALL_TEETH.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleWholeTooth(n)}
                        className={`rounded-md border px-1.5 py-1 text-[11px] font-medium ${pickTeeth.has(n) ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {procedureId && scope === 'sextant' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Sextant</label>
                  <select value={sextantKey} onChange={(e) => setSextantKey(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {SEXTANTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procedureId && scope === 'arch' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Arch</label>
                  <select value={archKey} onChange={(e) => setArchKey(e.target.value as 'upper' | 'lower')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {ARCHES.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procedureId && scope === 'whole_mouth' && <p className="text-xs text-slate-500">Applies to the whole mouth — no further selection needed.</p>}
            </>
          )}

          {txEditingId && (
            <p className="text-sm text-slate-600">
              {entries.find((e) => e.id === txEditingId)?.procedure_name} —{' '}
              {describeScope(scope, entries.find((e) => e.id === txEditingId)?.teeth ?? [], entries.find((e) => e.id === txEditingId)?.surfaces ?? [])}
              <span className="ml-2 text-xs text-slate-400">(tooth/surface selection is locked once charted — delete and re-add to change it)</span>
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Status</label>
              <select value={txStatus} onChange={(e) => setTxStatus(e.target.value as ChartStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {(Object.keys(CHART_STATUS_LABELS) as ChartStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CHART_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Provider (optional)</label>
              <select value={txProviderId} onChange={(e) => setTxProviderId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {providerFullName(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Price (optional)</label>
              <input type="number" step="0.01" min="0" value={txPrice} onChange={(e) => setTxPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <textarea value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

          <div className="flex gap-2">
            <button onClick={handleSaveTreatment} disabled={txSaving} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {txSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setTxOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'treatment' && !txOpen && (
        <button onClick={() => openTreatmentPanel()} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
          + Chart a procedure
        </button>
      )}

      {/* ---------------- History ---------------- */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-navy-900">{mode === 'diagnosis' ? 'Diagnosis history' : 'Procedure history'}</p>
        {mode === 'diagnosis' ? (
          diagnoses.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nothing recorded yet.</p>
          ) : (
            diagnoses
              .slice()
              .reverse()
              .map((d) => (
                <div key={d.id} className={`flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${!d.active ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-navy-900">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" style={{ backgroundColor: DIAGNOSIS_CONDITION_COLORS[d.condition] }} />
                      Tooth {d.tooth} — {DIAGNOSIS_CONDITION_LABELS[d.condition]}
                      {!d.active && <span className="text-xs font-normal text-slate-400">(resolved)</span>}
                      {d.source === 'auto' && <span className="text-xs font-normal text-slate-400">· auto</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.surfaces.length ? d.surfaces.join(', ') : 'Whole tooth'} · {formatDate(d.diagnosed_at)}
                      {d.note ? ` · ${d.note}` : ''}
                    </p>
                  </div>
                  {d.active && (
                    <div className="flex shrink-0 items-center gap-3">
                      <button onClick={() => openEditDiagnosis(d)} className="text-xs font-medium text-navy-700 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteDiagnosis(d.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
          )
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No procedures charted yet.</p>
        ) : (
          entries
            .slice()
            .reverse()
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-navy-900">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_STATUS_COLORS[e.status] }} />
                    {e.procedure_name}
                    <span className="text-xs font-normal text-slate-400">— {CHART_STATUS_LABELS[e.status]}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {describeScope(e.scope, e.teeth, e.surfaces)} · {formatDate(e.created_at)}
                    {e.provider_id && providers.find((p) => p.id === e.provider_id) ? ` · ${providerFullName(providers.find((p) => p.id === e.provider_id)!)}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => openEditEntry(e)} className="text-xs font-medium text-navy-700 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDeleteEntry(e.id)} className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
