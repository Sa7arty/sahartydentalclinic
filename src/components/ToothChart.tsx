import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ToothRecord, ToothStatus, TOOTH_STATUS_LABELS, TOOTH_STATUS_COLORS } from '../types'

// FDI two-digit notation, arranged left-to-right as viewed on a chart (patient's right on the left).
const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const TOOTH_PATH =
  'M12 1.5 C7.2 1.5 4.3 4.6 4.3 9.2 C4.3 13 6.1 15.2 7.1 17 L7.6 27.5 C7.6 31.5 10.2 31.5 10.7 27.6 L11.1 20.8 Q12 21.6 12.9 20.8 L13.3 27.6 C13.8 31.5 16.4 31.5 16.4 27.5 L16.9 17 C17.9 15.2 19.7 13 19.7 9.2 C19.7 4.6 16.8 1.5 12 1.5 Z'

function Tooth({
  n,
  orientation,
  status,
  onClick,
}: {
  n: number
  orientation: 'upper' | 'lower'
  status: ToothStatus
  onClick: () => void
}) {
  const color = TOOTH_STATUS_COLORS[status]
  return (
    <button
      onClick={onClick}
      title={`Tooth ${n} — ${TOOTH_STATUS_LABELS[status]}`}
      className="flex flex-col items-center gap-0.5 transition hover:scale-110"
    >
      <svg
        viewBox="0 0 24 33"
        width="22"
        height="30"
        style={orientation === 'upper' ? { transform: 'scaleY(-1)' } : undefined}
      >
        <path d={TOOTH_PATH} fill={color} stroke="#94a3b8" strokeWidth="1" />
      </svg>
      <span className="text-[10px] font-medium text-slate-600">{n}</span>
    </button>
  )
}

export default function ToothChart({ patientId }: { patientId: string }) {
  const { session } = useAuth()
  const [records, setRecords] = useState<Record<number, ToothRecord>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [status, setStatus] = useState<ToothStatus>('healthy')
  const [note, setNote] = useState('')

  useEffect(() => {
    load()
  }, [patientId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tooth_records').select('*').eq('patient_id', patientId)
    const map: Record<number, ToothRecord> = {}
    for (const r of data ?? []) map[r.tooth_number] = r
    setRecords(map)
    setLoading(false)
  }

  function selectTooth(n: number) {
    setSelected(n)
    const existing = records[n]
    setStatus(existing?.status ?? 'healthy')
    setNote(existing?.note ?? '')
  }

  async function handleSave() {
    if (selected === null) return
    const { error } = await supabase.from('tooth_records').upsert(
      {
        patient_id: patientId,
        tooth_number: selected,
        status,
        note: note || null,
        updated_by: session?.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id,tooth_number' },
    )
    if (error) alert(error.message)
    else {
      setSelected(null)
      load()
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs text-slate-500">Upper arch</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {UPPER_ROW.map((n) => (
            <Tooth key={n} n={n} orientation="upper" status={records[n]?.status ?? 'healthy'} onClick={() => selectTooth(n)} />
          ))}
        </div>
        <div className="my-4 border-t border-dashed border-slate-200" />
        <div className="flex flex-wrap justify-center gap-1.5">
          {LOWER_ROW.map((n) => (
            <Tooth key={n} n={n} orientation="lower" status={records[n]?.status ?? 'healthy'} onClick={() => selectTooth(n)} />
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Lower arch</p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: TOOTH_STATUS_COLORS[s] }} />
            {TOOTH_STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {selected !== null && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-medium text-navy-900">Tooth {selected}</p>
          <select value={status} onChange={(e) => setStatus(e.target.value as ToothStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((s) => (
              <option key={s} value={s}>
                {TOOTH_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
              Save
            </button>
            <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
