import { FormEvent, useMemo, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  ToothRecord,
  ToothStatus,
  TOOTH_STATUS_LABELS,
  TOOTH_STATUS_COLORS,
  ToothProcedure,
  ToothSurface,
  ALL_SURFACES,
  SURFACE_LABELS,
  ChartScope,
  CHART_SCOPE_LABELS,
  ChartStatus,
  CHART_STATUS_LABELS,
  CHART_STATUS_COLORS,
  Procedure,
  ProcedureCategory,
  Provider,
  providerFullName,
} from '../types'
import { formatDate } from '../lib/dates'
import { UPPER_ROW, LOWER_ROW, ALL_TEETH, SEXTANTS, ARCHES, expandScopeToTeeth, describeScope } from '../lib/dentalChart'

// ---------------------------------------------------------------------------
// A single tooth rendered as its 5 universal surfaces in a "plus" layout:
//        M
//     B  O  L      (O = occlusal on posterior teeth, incisal on anterior)
//        D
// The 4 corner cells are filler so the shape reads as a tooth, not a grid.
// ---------------------------------------------------------------------------
function ToothDiagram({
  surfaceColors,
  baseColor,
  selectable,
  selectedSurfaces,
  onToggleSurface,
  size = 32,
}: {
  surfaceColors: Partial<Record<ToothSurface, string>>
  baseColor?: string
  selectable?: boolean
  selectedSurfaces?: Set<ToothSurface>
  onToggleSurface?: (s: ToothSurface) => void
  size?: number
}) {
  const cell = size / 3
  const bg = baseColor ?? '#ffffff'
  const corners = [
    [0, 0],
    [2 * cell, 0],
    [0, 2 * cell],
    [2 * cell, 2 * cell],
  ]
  const surfaceRects: { key: ToothSurface; x: number; y: number }[] = [
    { key: 'M', x: cell, y: 0 },
    { key: 'B', x: 0, y: cell },
    { key: 'O', x: cell, y: cell },
    { key: 'L', x: 2 * cell, y: cell },
    { key: 'D', x: cell, y: 2 * cell },
  ]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <rect x={0} y={0} width={size} height={size} rx={4} fill={bg} stroke="#cbd5e1" strokeWidth={1} />
      {corners.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={cell} height={cell} fill={bg} />
      ))}
      {surfaceRects.map((r) => {
        const selected = selectedSurfaces?.has(r.key)
        const fill = surfaceColors[r.key] ?? bg
        return (
          <rect
            key={r.key}
            x={r.x}
            y={r.y}
            width={cell}
            height={cell}
            fill={fill}
            stroke={selected ? '#0f172a' : '#e2e8f0'}
            strokeWidth={selected ? 2 : 0.5}
            onClick={selectable ? () => onToggleSurface?.(r.key) : undefined}
            style={selectable ? { cursor: 'pointer' } : undefined}
          />
        )
      })}
    </svg>
  )
}

type SurfaceColorMap = Record<number, Partial<Record<ToothSurface, string>>>

function buildSurfaceColors(entries: ToothProcedure[]): SurfaceColorMap {
  const map: SurfaceColorMap = {}
  // Entries are loaded oldest-first, so a later entry naturally overrides an earlier
  // one when they touch the same surface — "what's the current state" wins.
  for (const e of entries) {
    const color = CHART_STATUS_COLORS[e.status]
    for (const tooth of e.teeth) {
      const surfaces = e.scope === 'surface' || e.scope === 'multi_surface' ? e.surfaces : ALL_SURFACES
      const cur = map[tooth] ?? {}
      for (const s of surfaces) cur[s] = color
      map[tooth] = cur
    }
  }
  return map
}

export default function ToothChart({ patientId }: { patientId: string }) {
  const { session } = useAuth()
  const [records, setRecords] = useState<Record<number, ToothRecord>>({})
  const [entries, setEntries] = useState<ToothProcedure[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [categories, setCategories] = useState<ProcedureCategory[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  // Quick baseline condition popover (unchanged behavior — whole tooth, no procedure link).
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [status, setStatus] = useState<ToothStatus>('healthy')
  const [note, setNote] = useState('')

  // "+ Chart a procedure" panel.
  const [charting, setCharting] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [procedureId, setProcedureId] = useState('')
  const [scope, setScope] = useState<ChartScope>('whole_tooth')
  const [pickTeeth, setPickTeeth] = useState<Set<number>>(new Set())
  const [pickTooth, setPickTooth] = useState<number | ''>('')
  const [pickSurfaces, setPickSurfaces] = useState<Set<ToothSurface>>(new Set())
  const [sextantKey, setSextantKey] = useState(SEXTANTS[0].key)
  const [archKey, setArchKey] = useState<'upper' | 'lower'>('upper')
  const [chartStatus, setChartStatus] = useState<ChartStatus>('planned')
  const [chartProviderId, setChartProviderId] = useState('')
  const [chartNote, setChartNote] = useState('')
  const [chartPrice, setChartPrice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  async function load() {
    setLoading(true)
    const [{ data: tr }, { data: tp }, { data: procs }, { data: cats }, { data: provs }] = await Promise.all([
      supabase.from('tooth_records').select('*').eq('patient_id', patientId),
      supabase.from('tooth_procedures').select('*').eq('patient_id', patientId).order('created_at', { ascending: true }),
      supabase.from('procedures').select('*, category:procedure_categories(name)').eq('active', true).order('name'),
      supabase.from('procedure_categories').select('*').eq('active', true).order('name'),
      supabase.from('providers').select('*').eq('active', true).order('first_name'),
    ])
    const map: Record<number, ToothRecord> = {}
    for (const r of tr ?? []) map[r.tooth_number] = r
    setRecords(map)
    setEntries((tp as ToothProcedure[]) ?? [])
    setProcedures((procs as Procedure[]) ?? [])
    setCategories((cats as ProcedureCategory[]) ?? [])
    setProviders((provs as Provider[]) ?? [])
    setLoading(false)
  }

  const surfaceColors = useMemo(() => buildSurfaceColors(entries), [entries])

  function selectTooth(n: number) {
    setSelectedTooth(n)
    const existing = records[n]
    setStatus(existing?.status ?? 'healthy')
    setNote(existing?.note ?? '')
  }

  async function handleSaveCondition() {
    if (selectedTooth === null) return
    const { error } = await supabase.from('tooth_records').upsert(
      { patient_id: patientId, tooth_number: selectedTooth, status, note: note || null, updated_by: session?.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'patient_id,tooth_number' },
    )
    if (error) alert(error.message)
    else {
      setSelectedTooth(null)
      load()
    }
  }

  function openChartPanel() {
    setEditingEntryId(null)
    setProcedureId('')
    setScope('whole_tooth')
    setPickTeeth(new Set())
    setPickTooth('')
    setPickSurfaces(new Set())
    setSextantKey(SEXTANTS[0].key)
    setArchKey('upper')
    setChartStatus('planned')
    setChartProviderId('')
    setChartNote('')
    setChartPrice('')
    setCharting(true)
  }

  function openEditEntry(e: ToothProcedure) {
    setEditingEntryId(e.id)
    setProcedureId(e.procedure_id ?? '')
    setScope(e.scope)
    setPickTeeth(new Set(e.teeth))
    setPickTooth(e.teeth[0] ?? '')
    setPickSurfaces(new Set(e.surfaces))
    setChartStatus(e.status)
    setChartProviderId(e.provider_id ?? '')
    setChartNote(e.note ?? '')
    setChartPrice(e.price != null ? String(e.price) : '')
    setCharting(true)
  }

  function pickProcedure(id: string) {
    setProcedureId(id)
    const p = procedures.find((x) => x.id === id)
    if (p) {
      setScope(p.default_scope)
      if (p.default_price != null) setChartPrice(String(p.default_price))
    }
  }

  function toggleSurface(s: ToothSurface) {
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

  async function handleSaveChartEntry() {
    const proc = procedures.find((p) => p.id === procedureId)
    const procedureName = proc?.name ?? entries.find((e) => e.id === editingEntryId)?.procedure_name
    if (!editingEntryId && !proc) return alert('Please choose a procedure.')

    let teeth: number[] = []
    let surfaces: ToothSurface[] = []
    if (!editingEntryId) {
      // Tooth/surface selection is locked once an entry exists — edits only touch status/note/price/provider.
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

    setSaving(true)
    const payload = {
      patient_id: patientId,
      procedure_id: proc?.id ?? null,
      procedure_name: procedureName,
      scope,
      teeth,
      surfaces,
      status: chartStatus,
      provider_id: chartProviderId || null,
      note: chartNote || null,
      price: chartPrice ? Number(chartPrice) : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = editingEntryId
      ? await supabase.from('tooth_procedures').update({ status: chartStatus, provider_id: chartProviderId || null, note: chartNote || null, price: chartPrice ? Number(chartPrice) : null, updated_at: new Date().toISOString() }).eq('id', editingEntryId)
      : await supabase.from('tooth_procedures').insert(payload)
    setSaving(false)
    if (error) alert(error.message)
    else {
      setCharting(false)
      load()
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this chart entry? This cannot be undone.')) return
    const { error } = await supabase.from('tooth_procedures').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  const groupedProcedures = categories.map((c) => ({ category: c, items: procedures.filter((p) => p.category_id === c.id) }))
  const uncategorized = procedures.filter((p) => !p.category_id)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">Upper arch</p>
          <button onClick={openChartPanel} className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-medium text-navy-950 hover:bg-gold-400">
            + Chart a procedure
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {UPPER_ROW.map((n) => (
            <button key={n} onClick={() => selectTooth(n)} className={`flex flex-col items-center gap-0.5 rounded p-0.5 ${selectedTooth === n ? 'bg-slate-100 ring-1 ring-navy-300' : 'hover:bg-slate-50'}`}>
              <ToothDiagram surfaceColors={surfaceColors[n] ?? {}} baseColor={TOOTH_STATUS_COLORS[records[n]?.status ?? 'healthy']} />
              <span className="text-[10px] font-medium text-sky-600">{n}</span>
            </button>
          ))}
        </div>
        <div className="my-4 border-t border-dashed border-slate-200" />
        <div className="flex flex-wrap justify-center gap-1.5">
          {LOWER_ROW.map((n) => (
            <button key={n} onClick={() => selectTooth(n)} className={`flex flex-col items-center gap-0.5 rounded p-0.5 ${selectedTooth === n ? 'bg-slate-100 ring-1 ring-navy-300' : 'hover:bg-slate-50'}`}>
              <span className="text-[10px] font-medium text-sky-600">{n}</span>
              <ToothDiagram surfaceColors={surfaceColors[n] ?? {}} baseColor={TOOTH_STATUS_COLORS[records[n]?.status ?? 'healthy']} />
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Lower arch</p>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: TOOTH_STATUS_COLORS[s] }} />
              {TOOTH_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 border-l border-slate-200 pl-4">
          {(Object.keys(CHART_STATUS_LABELS) as ChartStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: CHART_STATUS_COLORS[s] }} />
              {CHART_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      {selectedTooth !== null && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-medium text-navy-900">Tooth {selectedTooth} — baseline condition</p>
          <select value={status} onChange={(e) => setStatus(e.target.value as ToothStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((s) => (
              <option key={s} value={s}>
                {TOOTH_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSaveCondition} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Save
            </button>
            <button onClick={() => setSelectedTooth(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Charted procedures on this tooth</p>
            {entries.filter((e) => e.teeth.includes(selectedTooth)).length === 0 ? (
              <p className="text-xs text-slate-400">None yet.</p>
            ) : (
              <div className="space-y-1">
                {entries
                  .filter((e) => e.teeth.includes(selectedTooth))
                  .slice()
                  .reverse()
                  .map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_STATUS_COLORS[e.status] }} />
                        {e.procedure_name} — {describeScope(e.scope, e.teeth, e.surfaces)}
                      </span>
                      <button onClick={() => openEditEntry(e)} className="text-navy-700 hover:underline">
                        Edit
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {charting && (
        <div className="space-y-3 rounded-xl border border-gold-300 bg-gold-50/40 p-4">
          <p className="font-medium text-navy-900">{editingEntryId ? 'Edit charted procedure' : 'Chart a new procedure'}</p>

          {!editingEntryId && (
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
                      <ToothDiagram surfaceColors={{}} baseColor="#ffffff" selectable selectedSurfaces={pickSurfaces} onToggleSurface={toggleSurface} size={72} />
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

          {editingEntryId && (
            <p className="text-sm text-slate-600">
              {entries.find((e) => e.id === editingEntryId)?.procedure_name} — {describeScope(scope, entries.find((e) => e.id === editingEntryId)?.teeth ?? [], entries.find((e) => e.id === editingEntryId)?.surfaces ?? [])}
              <span className="ml-2 text-xs text-slate-400">(tooth/surface selection is locked once charted — delete and re-add to change it)</span>
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Status</label>
              <select value={chartStatus} onChange={(e) => setChartStatus(e.target.value as ChartStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {(Object.keys(CHART_STATUS_LABELS) as ChartStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CHART_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Provider (optional)</label>
              <select value={chartProviderId} onChange={(e) => setChartProviderId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
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
              <input type="number" step="0.01" min="0" value={chartPrice} onChange={(e) => setChartPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <textarea value={chartNote} onChange={(e) => setChartNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

          <div className="flex gap-2">
            <button onClick={handleSaveChartEntry} disabled={saving} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setCharting(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-navy-900">Procedure history</p>
        {entries.length === 0 ? (
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
