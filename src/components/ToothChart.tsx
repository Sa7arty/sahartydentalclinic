import { useEffect, useId, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/confirmDialog'
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
  DiagnosisConditionDef,
  Procedure,
  ProcedureCategory,
  Provider,
  providerFullName,
  PaintType,
} from '../types'
import { formatDate } from '../lib/dates'
import {
  UPPER_ROW,
  LOWER_ROW,
  ALL_TEETH,
  SEXTANTS,
  QUADRANTS,
  ARCHES,
  expandScopeToTeeth,
  describeScope,
  toothType,
  CROWN_W,
  CROWN_H,
  ROOT_H,
  CROWN_PATHS,
  ROOT_PATHS,
  IMPLANT_CAP_PATH,
  IMPLANT_SHAFT_PATH,
  IMPLANT_BASE_PATH,
  IMPLANT_THREAD_YS,
  POST_MARKER_PATH,
  PAINT_PRIORITY,
  ENDO_INDICATOR_COLOR,
  CARIES_COLOR,
  DENTURE_COLOR,
  NORMAL_ENAMEL_COLOR,
} from '../lib/dentalChart'

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
  const gradId = useId()
  const rootGradId = useId()
  const shadowId = useId()
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
  // Plain white means "nothing charted here" — show it as soft enamel shading
  // instead of a flat fill. Any assigned color (diagnosis/status) stays flat
  // and solid so it reads unambiguously.
  const enamel = baseColor === '#ffffff'
  const fillFor = (assigned: string | undefined) => assigned ?? (enamel ? `url(#${gradId})` : baseColor)

  return (
    <svg width={CROWN_W * scale} height={totalH * scale} viewBox={`0 0 ${CROWN_W} ${totalH}`} style={orientation === 'upper' ? { transform: 'scaleY(-1)' } : undefined}>
      <defs>
        <clipPath id={clipId}>
          <path d={crownPath} />
        </clipPath>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fffdf7" />
          <stop offset="55%" stopColor="#faf3e3" />
          <stop offset="100%" stopColor="#eee2c4" />
        </linearGradient>
        <linearGradient id={rootGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f6efdc" />
          <stop offset="100%" stopColor="#e5d9b8" />
        </linearGradient>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.7" stdDeviation="0.6" floodColor="#7c6a3f" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <path d={crownPath} fill={fillFor(undefined)} stroke="#c2b280" strokeWidth={0.6} />
      </g>
      <g clipPath={`url(#${clipId})`}>
        {corners.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={cellW} height={cellH} fill={fillFor(undefined)} />
        ))}
        {regions.map((r) => {
          const selected = selectedSurfaces?.has(r.key)
          return (
            <rect
              key={r.key}
              x={r.x}
              y={r.y}
              width={cellW}
              height={cellH}
              fill={fillFor(surfaceColors[r.key])}
              stroke={selected ? '#0f172a' : 'rgba(148,163,184,0.35)'}
              strokeWidth={selected ? 1.5 : 0.35}
              onClick={selectable ? () => onToggleSurface?.(r.key) : undefined}
              style={selectable ? { cursor: 'pointer' } : undefined}
            />
          )
        })}
        {/* Soft gloss highlight — purely decorative, never blocks clicks. */}
        <ellipse cx={CROWN_W * 0.32} cy={CROWN_H * 0.22} rx={CROWN_W * 0.16} ry={CROWN_H * 0.12} fill="#ffffff" opacity={0.35} pointerEvents="none" />
      </g>
      {showRoot &&
        rootPaths.map((p, i) => <path key={i} d={p} fill={`url(#${rootGradId})`} stroke="#cbb994" strokeWidth={0.6} />)}
    </svg>
  )
}

const MISSING_COLOR = '#9ca3af'
const EXTRACTION_COLOR = '#fde68a'

// ---------------------------------------------------------------------------
// A tooth whose current state calls for a completely different icon, not just
// a surface color — extraction, root canal (endo), a post, an implant fixture,
// a crown, or a missing tooth. Shape (and for extraction, whether it's shown
// pending or already gone) is decided by paint type + status.
// ---------------------------------------------------------------------------
function SpecialToothIcon({
  tooth,
  orientation,
  paintType,
  status,
  onClick,
  scale = 0.62,
}: {
  tooth: number
  orientation: 'upper' | 'lower'
  paintType: PaintType
  status: ChartStatus
  onClick?: () => void
  scale?: number
}) {
  const type = toothType(tooth)
  const crownPath = CROWN_PATHS[type]
  const rootPaths = ROOT_PATHS[type]
  const totalH = CROWN_H + ROOT_H
  const statusColor = CHART_STATUS_COLORS[status]
  const isMissingLook = paintType === 'missing' || (paintType === 'extraction' && status === 'completed')

  let content: JSX.Element
  if (paintType === 'implant') {
    content = (
      <>
        <path d={IMPLANT_BASE_PATH} fill="#f4f1ea" stroke="#c9c2ae" strokeWidth={0.6} />
        <path d={IMPLANT_SHAFT_PATH} fill={statusColor} stroke="#00000030" strokeWidth={0.4} />
        <path d={IMPLANT_CAP_PATH} fill={statusColor} stroke="#00000030" strokeWidth={0.4} />
        {IMPLANT_THREAD_YS.map((y) => (
          <line key={y} x1={15.5} y1={y} x2={24.5} y2={y} stroke="#00000035" strokeWidth={0.8} />
        ))}
      </>
    )
  } else if (isMissingLook) {
    content = (
      <>
        <path d={crownPath} fill={MISSING_COLOR} stroke="#6b7280" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={MISSING_COLOR} stroke="#6b7280" strokeWidth={0.6} />
        ))}
      </>
    )
  } else if (paintType === 'extraction') {
    content = (
      <>
        <path d={crownPath} fill={EXTRACTION_COLOR} stroke="#c9a63e" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={EXTRACTION_COLOR} stroke="#c9a63e" strokeWidth={0.6} />
        ))}
      </>
    )
  } else if (paintType === 'denture') {
    content = (
      <>
        <path d={crownPath} fill={DENTURE_COLOR} stroke="#c98aa0" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={DENTURE_COLOR} stroke="#c98aa0" strokeWidth={0.6} />
        ))}
      </>
    )
  } else if (paintType === 'crown') {
    content = (
      <>
        <path d={crownPath} fill={statusColor} stroke="#00000030" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={statusColor} opacity={0.75} stroke="#00000030" strokeWidth={0.6} />
        ))}
      </>
    )
  } else if (paintType === 'veneer') {
    // A thin colored shell on the crown only — the root is left looking like a normal tooth.
    content = (
      <>
        <path d={crownPath} fill={NORMAL_ENAMEL_COLOR} stroke="#c2b280" strokeWidth={0.6} />
        <path d={crownPath} fill={statusColor} opacity={0.45} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={NORMAL_ENAMEL_COLOR} stroke="#cbb994" strokeWidth={0.6} />
        ))}
      </>
    )
  } else if (paintType === 'caries') {
    // A warning-colored crown flags decay; the root is left looking normal.
    content = (
      <>
        <path d={crownPath} fill={CARIES_COLOR} stroke="#00000030" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={NORMAL_ENAMEL_COLOR} stroke="#cbb994" strokeWidth={0.6} />
        ))}
      </>
    )
  } else {
    // endo or post: crown always signals "root-canal work here", root carries the status color.
    content = (
      <>
        <path d={crownPath} fill={ENDO_INDICATOR_COLOR} stroke="#00000030" strokeWidth={0.6} />
        {rootPaths.map((p, i) => (
          <path key={i} d={p} fill={statusColor} stroke="#00000030" strokeWidth={0.6} />
        ))}
        {paintType === 'post' && <path d={POST_MARKER_PATH} fill="#ffffff" opacity={0.55} />}
      </>
    )
  }

  return (
    <svg
      width={CROWN_W * scale}
      height={totalH * scale}
      viewBox={`0 0 ${CROWN_W} ${totalH}`}
      style={orientation === 'upper' ? { transform: 'scaleY(-1)' } : undefined}
      onClick={onClick}
      className={onClick ? 'cursor-pointer' : undefined}
    >
      {content}
    </svg>
  )
}

type ResolvedPaint = { paintType: PaintType; status: ChartStatus }

/** What a tooth's overall icon should look like, blending diagnosis + treatment
 * data. Highest-priority non-"filling" paint type wins (see PAINT_PRIORITY);
 * returns null when nothing calls for anything but the plain surface-color view. */
function resolveToothPaint(
  tooth: number,
  diagnoses: ToothDiagnosis[],
  entries: ToothProcedure[],
  conditionById: Map<string, DiagnosisConditionDef>,
  procedureById: Map<string, Procedure>,
): ResolvedPaint | null {
  let best: ResolvedPaint | null = null
  let bestRank = Infinity
  const consider = (paintType: PaintType | undefined, status: ChartStatus) => {
    if (!paintType || paintType === 'filling') return
    const rank = PAINT_PRIORITY.indexOf(paintType)
    if (rank <= bestRank) {
      bestRank = rank
      best = { paintType, status }
    }
  }
  for (const d of diagnoses) {
    if (!d.active || d.tooth !== tooth) continue
    const cond = d.condition_id ? conditionById.get(d.condition_id) : undefined
    // A diagnosis describes the current, already-true state — treat it like a completed treatment.
    consider(cond?.paint_type, 'completed')
  }
  for (const e of entries) {
    if (!e.teeth.includes(tooth)) continue
    const proc = e.procedure_id ? procedureById.get(e.procedure_id) : undefined
    consider(proc?.paint_type, e.status)
  }
  return best
}

type DiagColorMap = Record<number, Partial<Record<ToothSurface, string>>>

function buildDiagnosisColors(diags: ToothDiagnosis[], colorById: Map<string, string>): DiagColorMap {
  const map: DiagColorMap = {}
  for (const d of diags.filter((x) => x.active)) {
    const color = (d.condition_id && colorById.get(d.condition_id)) || '#94a3b8'
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
    const surfaces = e.scope === 'surface' ? e.surfaces : ALL_SURFACES
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
  const [conditions, setConditions] = useState<DiagnosisConditionDef[]>([])
  const [entries, setEntries] = useState<ToothProcedure[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [categories, setCategories] = useState<ProcedureCategory[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  // ---- Diagnosis panel ----
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagEditingId, setDiagEditingId] = useState<string | null>(null)
  const [diagTooth, setDiagTooth] = useState<number | null>(null) // the tooth clicked to open the panel, if any — drives the "history on this tooth" convenience view
  const [diagConditionId, setDiagConditionId] = useState('')
  const [diagScope, setDiagScope] = useState<ChartScope>('whole_tooth')
  const [diagPickTeeth, setDiagPickTeeth] = useState<Set<number>>(new Set())
  const [diagPickTooth, setDiagPickTooth] = useState<number | ''>('')
  const [diagSurfaces, setDiagSurfaces] = useState<Set<ToothSurface>>(new Set())
  const [diagSextantKey, setDiagSextantKey] = useState(SEXTANTS[0].key)
  const [diagQuadrantKey, setDiagQuadrantKey] = useState(QUADRANTS[0].key)
  const [diagArchKey, setDiagArchKey] = useState<'upper' | 'lower'>('upper')
  const [diagRangeFrom, setDiagRangeFrom] = useState<number | ''>('')
  const [diagRangeTo, setDiagRangeTo] = useState<number | ''>('')
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
  const [quadrantKey, setQuadrantKey] = useState(QUADRANTS[0].key)
  const [archKey, setArchKey] = useState<'upper' | 'lower'>('upper')
  const [rangeFrom, setRangeFrom] = useState<number | ''>('')
  const [rangeTo, setRangeTo] = useState<number | ''>('')
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
    const [{ data: diags }, { data: conds }, { data: tp }, { data: procs }, { data: cats }, { data: provs }] = await Promise.all([
      supabase.from('tooth_diagnoses').select('*').eq('patient_id', patientId).order('diagnosed_at', { ascending: true }),
      supabase.from('diagnosis_conditions').select('*').eq('active', true).order('name'),
      supabase.from('tooth_procedures').select('*').eq('patient_id', patientId).order('created_at', { ascending: true }),
      supabase.from('procedures').select('*, category:procedure_categories(name)').eq('active', true).order('name'),
      supabase.from('procedure_categories').select('*').eq('active', true).order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
    ])
    setDiagnoses((diags as ToothDiagnosis[]) ?? [])
    setConditions((conds as DiagnosisConditionDef[]) ?? [])
    setEntries((tp as ToothProcedure[]) ?? [])
    setProcedures((procs as Procedure[]) ?? [])
    setCategories((cats as ProcedureCategory[]) ?? [])
    setProviders((provs as Provider[]) ?? [])
    setLoading(false)
  }

  const conditionById = useMemo(() => new Map(conditions.map((c) => [c.id, c])), [conditions])
  const conditionColorById = useMemo(() => new Map(conditions.map((c) => [c.id, c.color])), [conditions])
  const procedureById = useMemo(() => new Map(procedures.map((p) => [p.id, p])), [procedures])
  const diagnosisColors = useMemo(() => buildDiagnosisColors(diagnoses, conditionColorById), [diagnoses, conditionColorById])
  const statusColors = useMemo(() => buildStatusColors(entries), [entries])
  const surfaceColorsFor = (n: number) => (mode === 'diagnosis' ? diagnosisColors[n] ?? {} : statusColors[n] ?? {})
  const paintFor = (n: number) => resolveToothPaint(n, diagnoses, entries, conditionById, procedureById)

  // ---------------- Diagnosis mode ----------------
  // "Armed" condition = fast bulk mode: press a condition below the chart, then
  // click through teeth to toggle that whole-tooth finding on/off, no dialog.
  const [armedConditionId, setArmedConditionId] = useState<string | null>(null)

  function toggleArmed(id: string) {
    setDiagOpen(false)
    setArmedConditionId((cur) => (cur === id ? null : id))
  }

  /** A tooth can only carry ONE active finding per condition — deactivates any other
   * active match on this tooth+condition before writing, whatever surfaces it covers. */
  async function resolveOtherActiveMatches(tooth: number, conditionId: string, excludeId?: string) {
    const matches = diagnoses.filter((d) => d.tooth === tooth && d.active && d.condition_id === conditionId && d.id !== excludeId)
    if (matches.length === 0) return
    await supabase.from('tooth_diagnoses').update({ active: false }).in('id', matches.map((d) => d.id))
    setDiagnoses((cur) => cur.map((d) => (matches.some((m) => m.id === d.id) ? { ...d, active: false } : d)))
  }

  async function handleArmedToothClick(tooth: number) {
    if (!armedConditionId) return
    const cond = conditionById.get(armedConditionId)
    if (!cond) return
    const existing = diagnoses.find((d) => d.tooth === tooth && d.active && d.condition_id === armedConditionId)
    if (existing) {
      const { error } = await supabase.from('tooth_diagnoses').update({ active: false, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) return alert(error.message)
      setDiagnoses((cur) => cur.map((d) => (d.id === existing.id ? { ...d, active: false } : d)))
    } else {
      const { data, error } = await supabase
        .from('tooth_diagnoses')
        .insert({ patient_id: patientId, tooth, surfaces: [], condition_id: armedConditionId, condition_name: cond.name, note: null, source: 'manual' })
        .select()
        .single()
      if (error) return alert(error.message)
      setDiagnoses((cur) => [...cur, data as ToothDiagnosis])
    }
  }

  function openDiagnosisPanel(tooth?: number, surface?: ToothSurface) {
    setDiagEditingId(null)
    setDiagTooth(tooth ?? null)
    const first = conditions[0]
    setDiagConditionId(first?.id ?? '')
    setDiagPickTeeth(tooth ? new Set([tooth]) : new Set())
    setDiagPickTooth(tooth ?? '')
    setDiagSextantKey(SEXTANTS[0].key)
    setDiagQuadrantKey(QUADRANTS[0].key)
    setDiagArchKey('upper')
    setDiagRangeFrom('')
    setDiagRangeTo('')
    if (surface) {
      setDiagScope('surface')
      setDiagSurfaces(new Set([surface]))
    } else {
      setDiagScope(first && first.default_scope === 'surface' ? 'surface' : 'whole_tooth')
      setDiagSurfaces(new Set())
    }
    setDiagNote('')
    setDiagOpen(true)
  }
  function pickDiagCondition(id: string) {
    setDiagConditionId(id)
    const c = conditionById.get(id)
    if (c && diagSurfaces.size === 0) setDiagScope(c.default_scope)
  }
  function openEditDiagnosis(d: ToothDiagnosis) {
    setDiagEditingId(d.id)
    setDiagTooth(d.tooth)
    setDiagScope(d.surfaces.length === 0 ? 'whole_tooth' : 'surface')
    setDiagPickTeeth(new Set([d.tooth]))
    setDiagPickTooth(d.tooth)
    setDiagSurfaces(new Set(d.surfaces))
    setDiagConditionId(d.condition_id ?? '')
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
  function toggleDiagWholeTooth(n: number) {
    setDiagPickTeeth((cur) => {
      const next = new Set(cur)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }
  async function handleSaveDiagnosis() {
    if (!diagConditionId) return alert('Please choose a condition.')
    const cond = conditionById.get(diagConditionId)
    const conditionName = cond?.name ?? diagnoses.find((d) => d.id === diagEditingId)?.condition_name ?? 'Other'

    // Editing only ever touches one existing row (tooth/surfaces are locked after charting).
    if (diagEditingId) {
      setDiagSaving(true)
      await resolveOtherActiveMatches(diagTooth as number, diagConditionId, diagEditingId)
      const { error } = await supabase
        .from('tooth_diagnoses')
        .update({ condition_id: diagConditionId, condition_name: conditionName, note: diagNote || null, updated_at: new Date().toISOString() })
        .eq('id', diagEditingId)
      setDiagSaving(false)
      if (error) return alert(error.message)
      setDiagOpen(false)
      load()
      return
    }

    let teeth: number[] = []
    let surfaces: ToothSurface[] = []
    if (diagScope === 'surface') {
      if (!diagPickTooth) return alert('Please choose a tooth.')
      if (diagSurfaces.size === 0) return alert('Please choose at least one surface.')
      teeth = [diagPickTooth as number]
      surfaces = Array.from(diagSurfaces)
    } else if (diagScope === 'whole_tooth') {
      if (diagPickTeeth.size === 0) return alert('Please choose at least one tooth.')
      teeth = Array.from(diagPickTeeth)
    } else if (diagScope === 'tooth_range') {
      if (!diagRangeFrom || !diagRangeTo) return alert('Please choose both ends of the tooth range.')
      teeth = expandScopeToTeeth(diagScope, { rangeFrom: diagRangeFrom as number, rangeTo: diagRangeTo as number })
    } else {
      teeth = expandScopeToTeeth(diagScope, { sextantKey: diagSextantKey, quadrantKey: diagQuadrantKey, archKey: diagArchKey })
    }
    if (teeth.length === 0) return alert('Please make a selection.')

    setDiagSaving(true)
    for (const tooth of teeth) {
      await resolveOtherActiveMatches(tooth, diagConditionId)
      const { error } = await supabase.from('tooth_diagnoses').insert({
        patient_id: patientId,
        tooth,
        surfaces,
        condition_id: diagConditionId,
        condition_name: conditionName,
        note: diagNote || null,
        source: 'manual',
      })
      if (error) {
        setDiagSaving(false)
        return alert(error.message)
      }
    }
    setDiagSaving(false)
    setDiagOpen(false)
    load()
  }
  async function handleResolveDiagnosis(d: ToothDiagnosis) {
    const { error } = await supabase.from('tooth_diagnoses').update({ active: false, updated_at: new Date().toISOString() }).eq('id', d.id)
    if (error) alert(error.message)
    else load()
  }
  async function handleDeleteDiagnosis(id: string) {
    if (!(await confirmDialog('Delete this diagnosis entry? This cannot be undone.'))) return
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
    setQuadrantKey(QUADRANTS[0].key)
    setArchKey('upper')
    setRangeFrom('')
    setRangeTo('')
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
    if (!proc?.results_in_condition_id) return
    const cond = conditionById.get(proc.results_in_condition_id)
    if (!cond) return
    const { data: already } = await supabase.from('tooth_diagnoses').select('id').eq('source_tooth_procedure_id', entryId).eq('active', true).limit(1)
    if (already && already.length > 0) return

    const wholeTooth = scope !== 'surface'
    for (const tooth of teeth) {
      // Superseded: any existing active diagnosis on this tooth that overlaps the treated surfaces is now out of date.
      const { data: existing } = await supabase.from('tooth_diagnoses').select('id, surfaces').eq('patient_id', patientId).eq('tooth', tooth).eq('active', true)
      const toResolve = (existing ?? []).filter((d: any) => wholeTooth || d.surfaces.length === 0 || d.surfaces.some((s: string) => surfaces.includes(s as ToothSurface)))
      if (toResolve.length > 0) await supabase.from('tooth_diagnoses').update({ active: false }).in('id', toResolve.map((d: any) => d.id))
      await supabase.from('tooth_diagnoses').insert({
        patient_id: patientId,
        tooth,
        surfaces: wholeTooth ? [] : surfaces,
        condition_id: cond.id,
        condition_name: cond.name,
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
      if (scope === 'surface') {
        if (!pickTooth) return alert('Please choose a tooth.')
        if (pickSurfaces.size === 0) return alert('Please choose at least one surface.')
        teeth = [pickTooth as number]
        surfaces = Array.from(pickSurfaces)
      } else if (scope === 'whole_tooth') {
        if (pickTeeth.size === 0) return alert('Please choose at least one tooth.')
        teeth = Array.from(pickTeeth)
      } else if (scope === 'tooth_range') {
        if (!rangeFrom || !rangeTo) return alert('Please choose both ends of the tooth range.')
        teeth = expandScopeToTeeth(scope, { rangeFrom: rangeFrom as number, rangeTo: rangeTo as number })
      } else {
        teeth = expandScopeToTeeth(scope, { sextantKey, quadrantKey, archKey })
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
    if (!(await confirmDialog('Delete this chart entry? This cannot be undone.'))) return
    const { error } = await supabase.from('tooth_procedures').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  function handleToothClick(n: number, surface?: ToothSurface) {
    if (mode === 'diagnosis') {
      if (armedConditionId) handleArmedToothClick(n)
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
          className={`flex-1 rounded-md px-4 py-2.5 text-base font-medium ${mode === 'diagnosis' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
        >
          🩺 Diagnosis
        </button>
        <button
          onClick={() => {
            setArmedConditionId(null)
            setMode('treatment')
          }}
          className={`flex-1 rounded-md px-4 py-2.5 text-base font-medium ${mode === 'treatment' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-slate-100'}`}
        >
          📋 Treatment plan
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs text-slate-500">
          Upper arch
          {mode === 'diagnosis'
            ? armedConditionId
              ? ` — click any tooth to mark it "${conditionById.get(armedConditionId)?.name ?? ''}".`
              : ' — click a surface to record a finding, or the number for the whole tooth.'
            : ' — click a surface to chart a procedure, or the number for the whole tooth.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {UPPER_ROW.map((n) => {
            const special = paintFor(n)
            return (
              <div key={n} className="flex flex-col items-center gap-0.5">
                {special ? (
                  <SpecialToothIcon tooth={n} orientation="upper" paintType={special.paintType} status={special.status} onClick={() => handleToothClick(n)} />
                ) : (
                  <ToothDiagram tooth={n} orientation="upper" surfaceColors={surfaceColorsFor(n)} selectable onToggleSurface={(s) => handleToothClick(n, s)} />
                )}
                <button onClick={() => handleToothClick(n)} className="text-[10px] font-medium text-sky-600 hover:underline">
                  {n}
                </button>
              </div>
            )
          })}
        </div>
        <div className="my-4 border-t border-dashed border-slate-200" />
        <div className="flex flex-wrap justify-center gap-2">
          {LOWER_ROW.map((n) => {
            const special = paintFor(n)
            return (
              <div key={n} className="flex flex-col items-center gap-0.5">
                <button onClick={() => handleToothClick(n)} className="text-[10px] font-medium text-sky-600 hover:underline">
                  {n}
                </button>
                {special ? (
                  <SpecialToothIcon tooth={n} orientation="lower" paintType={special.paintType} status={special.status} onClick={() => handleToothClick(n)} />
                ) : (
                  <ToothDiagram tooth={n} orientation="lower" surfaceColors={surfaceColorsFor(n)} selectable onToggleSurface={(s) => handleToothClick(n, s)} />
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Lower arch</p>
      </div>

      {mode === 'diagnosis' ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {conditions.length === 0 && <p className="text-slate-400">No diagnosis conditions configured yet — add some in Settings.</p>}
            {conditions.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleArmed(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition ${
                  armedConditionId === c.id ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {armedConditionId ? (
              <>
                <span className="font-medium text-navy-800">{conditionById.get(armedConditionId)?.name}</span> is armed — click every tooth that has it (click again to remove). Press the pill again when
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
      {diagOpen && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-medium text-navy-900">{diagEditingId ? 'Edit diagnosis' : 'New diagnosis'}</p>

          <select value={diagConditionId} onChange={(e) => pickDiagCondition(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Select a condition —</option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {!diagEditingId && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Treatment area</label>
                <select value={diagScope} onChange={(e) => setDiagScope(e.target.value as ChartScope)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                  {(Object.keys(CHART_SCOPE_LABELS) as ChartScope[]).map((s) => (
                    <option key={s} value={s}>
                      {CHART_SCOPE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              {diagScope === 'surface' && (
                <div className="space-y-2">
                  <label className="mb-1 block text-xs text-slate-500">Tooth</label>
                  <select
                    value={diagPickTooth}
                    onChange={(e) => {
                      setDiagPickTooth(e.target.value ? Number(e.target.value) : '')
                      setDiagSurfaces(new Set())
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
                  {diagPickTooth && (
                    <div className="flex items-center gap-3">
                      <ToothDiagram tooth={diagPickTooth as number} orientation="lower" surfaceColors={{}} selectable selectedSurfaces={diagSurfaces} onToggleSurface={toggleDiagSurface} scale={1.8} />
                      <div className="text-xs text-slate-500">
                        Click one or more surfaces.
                        {diagSurfaces.size > 0 && <p className="mt-1 font-medium text-navy-800">{Array.from(diagSurfaces).map((s) => SURFACE_LABELS[s]).join(', ')}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {diagScope === 'whole_tooth' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Tooth (or teeth)</label>
                  <div className="flex flex-wrap gap-1">
                    {ALL_TEETH.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleDiagWholeTooth(n)}
                        className={`rounded-md border px-1.5 py-1 text-[11px] font-medium ${diagPickTeeth.has(n) ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {diagScope === 'tooth_range' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">From tooth</label>
                    <select value={diagRangeFrom} onChange={(e) => setDiagRangeFrom(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">—</option>
                      {ALL_TEETH.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">To tooth</label>
                    <select value={diagRangeTo} onChange={(e) => setDiagRangeTo(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">—</option>
                      {ALL_TEETH.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {diagScope === 'sextant' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Sextant</label>
                  <select value={diagSextantKey} onChange={(e) => setDiagSextantKey(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {SEXTANTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {diagScope === 'quadrant' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Quadrant</label>
                  <select value={diagQuadrantKey} onChange={(e) => setDiagQuadrantKey(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {QUADRANTS.map((q) => (
                      <option key={q.key} value={q.key}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {diagScope === 'arch' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Arch</label>
                  <select value={diagArchKey} onChange={(e) => setDiagArchKey(e.target.value as 'upper' | 'lower')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {ARCHES.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {diagScope === 'whole_mouth' && <p className="text-xs text-slate-500">Applies to the whole mouth — no further selection needed.</p>}
            </>
          )}

          {diagEditingId && (
            <p className="text-sm text-slate-600">
              Tooth {diagTooth} — {diagnoses.find((d) => d.id === diagEditingId)?.surfaces.length ? Array.from(diagSurfaces).join(', ') : 'whole tooth'}
              <span className="ml-2 text-xs text-slate-400">(tooth/surface selection is locked once charted — delete and re-add to change it)</span>
            </p>
          )}

          <textarea value={diagNote} onChange={(e) => setDiagNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSaveDiagnosis} disabled={diagSaving} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {diagSaving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setDiagOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>

          {diagTooth !== null && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-medium text-slate-500">History on tooth {diagTooth}</p>
              {diagsForTooth(diagTooth).length === 0 ? (
                <p className="text-xs text-slate-400">None yet.</p>
              ) : (
                <div className="space-y-1">
                  {diagsForTooth(diagTooth).map((d) => (
                    <div key={d.id} className={`flex items-center justify-between gap-2 text-xs ${!d.active ? 'text-slate-400 line-through' : ''}`}>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300" style={{ backgroundColor: (d.condition_id && conditionColorById.get(d.condition_id)) || '#94a3b8' }} />
                        {d.condition_name} — {d.surfaces.length ? d.surfaces.join(', ') : 'whole tooth'}
                        {d.source === 'auto' && <span className="text-slate-400"> (auto)</span>}
                      </span>
                      <span className="flex shrink-0 gap-2">
                        {d.active && (
                          <>
                            <button onClick={() => openEditDiagnosis(d)} className="text-navy-700 hover:underline">
                              Edit
                            </button>
                            <button onClick={() => handleResolveDiagnosis(d)} className="text-amber-600 hover:underline">
                              Resolve
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDeleteDiagnosis(d.id)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

              {procedureId && scope === 'surface' && (
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
                        Click one or more surfaces.
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

              {procedureId && scope === 'tooth_range' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">From tooth</label>
                    <select value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">—</option>
                      {ALL_TEETH.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">To tooth</label>
                    <select value={rangeTo} onChange={(e) => setRangeTo(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">—</option>
                      {ALL_TEETH.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  {rangeFrom && rangeTo && <p className="text-xs text-slate-500">Both teeth must be in the same arch.</p>}
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

              {procedureId && scope === 'quadrant' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Quadrant</label>
                  <select value={quadrantKey} onChange={(e) => setQuadrantKey(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs">
                    {QUADRANTS.map((q) => (
                      <option key={q.key} value={q.key}>
                        {q.label}
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

      {mode === 'diagnosis' && !diagOpen && (
        <button onClick={() => openDiagnosisPanel()} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
          + Log a finding
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
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" style={{ backgroundColor: (d.condition_id && conditionColorById.get(d.condition_id)) || '#94a3b8' }} />
                      Tooth {d.tooth} — {d.condition_name}
                      {!d.active && <span className="text-xs font-normal text-slate-400">(resolved)</span>}
                      {d.source === 'auto' && <span className="text-xs font-normal text-slate-400">· auto</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.surfaces.length ? d.surfaces.join(', ') : 'Whole tooth'} · {formatDate(d.diagnosed_at)}
                      {d.note ? ` · ${d.note}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {d.active && (
                      <button onClick={() => openEditDiagnosis(d)} className="text-xs font-medium text-navy-700 hover:underline">
                        Edit
                      </button>
                    )}
                    <button onClick={() => handleDeleteDiagnosis(d.id)} className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
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
