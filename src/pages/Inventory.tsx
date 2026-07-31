import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Inventory as InventoryType, InventoryCluster, InventoryItem, InventoryCount, needToBuy } from '../types'
import { exportOrderSummaryPdf } from '../lib/pdf'

type View = 'count' | 'order'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Inventory() {
  const { session, isDentist } = useAuth()
  const [inventories, setInventories] = useState<InventoryType[]>([])
  const [inventoryId, setInventoryId] = useState('')
  const [clusters, setClusters] = useState<InventoryCluster[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [counts, setCounts] = useState<Record<string, InventoryCount>>({})
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)) // yyyy-mm
  const [view, setView] = useState<View>('count')
  const [loading, setLoading] = useState(true)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addingToCluster, setAddingToCluster] = useState<string | null>(null)
  const [showAddCluster, setShowAddCluster] = useState(false)

  const period = `${month}-01`
  const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

  useEffect(() => {
    supabase
      .from('inventories')
      .select('*')
      .order('position')
      .then(({ data }) => {
        const list = (data as InventoryType[]) ?? []
        setInventories(list)
        if (list[0]) setInventoryId((cur) => cur || list[0].id)
      })
  }, [])

  useEffect(() => {
    if (inventoryId) loadStructure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId])

  useEffect(() => {
    if (items.length) loadCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, items])

  async function loadStructure() {
    setLoading(true)
    const { data: cl } = await supabase.from('inventory_clusters').select('*').eq('inventory_id', inventoryId).order('position')
    const clusterList = (cl as InventoryCluster[]) ?? []
    setClusters(clusterList)
    if (clusterList.length) {
      const { data: it } = await supabase.from('inventory_items').select('*').in('cluster_id', clusterList.map((c) => c.id)).eq('active', true).order('position')
      setItems((it as InventoryItem[]) ?? [])
    } else {
      setItems([])
    }
    setLoading(false)
  }

  async function loadCounts() {
    const { data } = await supabase.from('inventory_counts').select('*').eq('period', period).in('item_id', items.map((i) => i.id))
    const map: Record<string, InventoryCount> = {}
    for (const c of (data as InventoryCount[]) ?? []) map[c.item_id] = c
    setCounts(map)
  }

  async function saveCount(itemId: string, patch: Partial<Pick<InventoryCount, 'current_quantity' | 'ordered'>>) {
    const existing = counts[itemId]
    const row = {
      item_id: itemId,
      period,
      current_quantity: patch.current_quantity !== undefined ? patch.current_quantity : existing?.current_quantity ?? null,
      ordered: patch.ordered !== undefined ? patch.ordered : existing?.ordered ?? false,
      updated_by: session?.user.id,
      updated_at: new Date().toISOString(),
    }
    setCounts((c) => ({ ...c, [itemId]: { ...(existing ?? { id: 'tmp', item_id: itemId, period }), ...row } as InventoryCount }))
    const { error } = await supabase.from('inventory_counts').upsert(row, { onConflict: 'item_id,period' })
    if (error) alert(error.message)
  }

  // ---- item management (dentist) ----
  async function handleAddItem(e: FormEvent<HTMLFormElement>, clusterId: string, position: number) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = (f.get('name') as string)?.trim()
    if (!name) return
    const { error } = await supabase.from('inventory_items').insert({
      cluster_id: clusterId,
      name,
      brand: (f.get('brand') as string) || null,
      original_quantity: Number(f.get('original_quantity')) || 0,
      position,
    })
    if (error) return alert(error.message)
    e.currentTarget.reset()
    setAddingToCluster(null)
    loadStructure()
  }

  async function handleSaveItem(e: FormEvent<HTMLFormElement>, item: InventoryItem) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const { error } = await supabase
      .from('inventory_items')
      .update({ name: f.get('name'), brand: (f.get('brand') as string) || null, original_quantity: Number(f.get('original_quantity')) || 0 })
      .eq('id', item.id)
    if (error) return alert(error.message)
    setEditingItemId(null)
    loadStructure()
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('Delete this item and its count history?')) return
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) alert(error.message)
    else loadStructure()
  }

  async function handleMoveItem(item: InventoryItem, dir: -1 | 1) {
    const siblings = items.filter((i) => i.cluster_id === item.cluster_id)
    const idx = siblings.findIndex((i) => i.id === item.id)
    const swap = siblings[idx + dir]
    if (!swap) return
    await Promise.all([
      supabase.from('inventory_items').update({ position: swap.position }).eq('id', item.id),
      supabase.from('inventory_items').update({ position: item.position }).eq('id', swap.id),
    ])
    loadStructure()
  }

  // Insert a new blank item directly above the given one (position = midpoint with previous sibling).
  async function handleInsertAbove(item: InventoryItem) {
    const siblings = items.filter((i) => i.cluster_id === item.cluster_id)
    const idx = siblings.findIndex((i) => i.id === item.id)
    const prev = siblings[idx - 1]
    const newPos = prev ? (Number(prev.position) + Number(item.position)) / 2 : Number(item.position) - 1
    const { error } = await supabase.from('inventory_items').insert({ cluster_id: item.cluster_id, name: 'New item', brand: null, original_quantity: 0, position: newPos })
    if (error) return alert(error.message)
    const { data } = await supabase.from('inventory_items').select('*').eq('cluster_id', item.cluster_id).eq('name', 'New item').order('created_at', { ascending: false }).limit(1)
    await loadStructure()
    if (data && data[0]) setEditingItemId((data[0] as InventoryItem).id)
  }

  async function handleAddCluster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = (f.get('name') as string)?.trim()
    if (!name) return
    const maxPos = clusters.reduce((m, c) => Math.max(m, c.position), 0)
    const { error } = await supabase.from('inventory_clusters').insert({ inventory_id: inventoryId, name, position: maxPos + 1 })
    if (error) return alert(error.message)
    e.currentTarget.reset()
    setShowAddCluster(false)
    loadStructure()
  }

  async function handleRenameCluster(id: string, name: string) {
    if (!name.trim()) return
    await supabase.from('inventory_clusters').update({ name: name.trim() }).eq('id', id)
    loadStructure()
  }

  async function handleDeleteCluster(id: string) {
    if (!confirm('Delete this storage location and all its items?')) return
    const { error } = await supabase.from('inventory_clusters').delete().eq('id', id)
    if (error) alert(error.message)
    else loadStructure()
  }

  async function handleMoveCluster(cluster: InventoryCluster, dir: -1 | 1) {
    const idx = clusters.findIndex((c) => c.id === cluster.id)
    const swap = clusters[idx + dir]
    if (!swap) return
    await Promise.all([
      supabase.from('inventory_clusters').update({ position: swap.position }).eq('id', cluster.id),
      supabase.from('inventory_clusters').update({ position: cluster.position }).eq('id', swap.id),
    ])
    loadStructure()
  }

  const itemsByCluster = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {}
    for (const i of items) (map[i.cluster_id] = map[i.cluster_id] ?? []).push(i)
    return map
  }, [items])

  const orderLines = useMemo(() => {
    const lines: { cluster: string; name: string; brand: string; qty: number }[] = []
    for (const c of clusters) {
      for (const i of itemsByCluster[c.id] ?? []) {
        const qty = needToBuy(i.original_quantity, counts[i.id]?.current_quantity ?? null)
        if (qty > 0) lines.push({ cluster: c.name, name: i.name, brand: i.brand ?? '', qty })
      }
    }
    return lines
  }, [clusters, itemsByCluster, counts])

  const totalToBuy = orderLines.reduce((s, l) => s + l.qty, 0)
  const inputCls = 'rounded-lg border border-slate-300 px-2 py-1 text-sm'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Inventory</h1>
        <div className="flex flex-wrap items-center gap-2">
          {inventories.length > 1 && (
            <select value={inventoryId} onChange={(e) => setInventoryId(e.target.value)} className={inputCls}>
              {inventories.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name}
                </option>
              ))}
            </select>
          )}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['count', 'order'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${view === v ? 'border-gold-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'}`}
          >
            {v === 'count' ? 'Stock count' : `Order summary${totalToBuy > 0 ? ` (${orderLines.length})` : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : view === 'count' ? (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">
            Counting for <span className="font-medium text-navy-800">{monthLabel}</span>. Enter what you currently have of each item; the app works out how many to buy.
            {' '}<span className="rounded bg-amber-50 px-1 text-amber-700">Amber rows</span> are below target (need restocking).
          </p>

          {clusters.map((cluster, ci) => (
            <div key={cluster.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                {isDentist ? (
                  <input
                    defaultValue={cluster.name}
                    onBlur={(e) => e.target.value !== cluster.name && handleRenameCluster(cluster.id, e.target.value)}
                    className="w-full max-w-xs rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-navy-900 hover:border-slate-300 focus:border-slate-300 focus:bg-white"
                  />
                ) : (
                  <p className="text-sm font-semibold text-navy-900">{cluster.name}</p>
                )}
                {isDentist && (
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <button onClick={() => handleMoveCluster(cluster, -1)} disabled={ci === 0} className="rounded px-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30">
                      ↑
                    </button>
                    <button onClick={() => handleMoveCluster(cluster, 1)} disabled={ci === clusters.length - 1} className="rounded px-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30">
                      ↓
                    </button>
                    <button onClick={() => setAddingToCluster(addingToCluster === cluster.id ? null : cluster.id)} className="font-medium text-navy-700 hover:underline">
                      + Item
                    </button>
                    <button onClick={() => handleDeleteCluster(cluster.id)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5">Item</th>
                    <th className="px-3 py-1.5">Brand</th>
                    <th className="px-3 py-1.5 text-center">Target</th>
                    <th className="px-3 py-1.5 text-center">Have now</th>
                    <th className="px-3 py-1.5 text-center">To buy</th>
                    <th className="px-3 py-1.5 text-center">Ordered</th>
                    {isDentist && <th className="px-3 py-1.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {(itemsByCluster[cluster.id] ?? []).map((item, ii, arr) =>
                    editingItemId === item.id ? (
                      <tr key={item.id} className="border-t border-slate-100 bg-slate-50">
                        <td colSpan={isDentist ? 7 : 6} className="px-3 py-2">
                          <form onSubmit={(e) => handleSaveItem(e, item)} className="flex flex-wrap items-center gap-2">
                            <input name="name" defaultValue={item.name} placeholder="Item name" className={`${inputCls} flex-1`} />
                            <input name="brand" defaultValue={item.brand ?? ''} placeholder="Brand" className={inputCls} />
                            <input name="original_quantity" type="number" step="0.01" min="0" defaultValue={item.original_quantity} title="Target quantity" className={`${inputCls} w-24`} />
                            <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1 text-xs font-medium text-white hover:bg-navy-800">
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingItemId(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-navy-800 hover:bg-slate-50">
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className={`border-t border-slate-100 ${needToBuy(item.original_quantity, counts[item.id]?.current_quantity ?? null) > 0 ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-1.5 text-navy-900">{item.name}</td>
                        <td className="px-3 py-1.5 text-slate-500">{item.brand || '—'}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{Number(item.original_quantity)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={counts[item.id]?.current_quantity ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value)
                              if (v !== (counts[item.id]?.current_quantity ?? null)) saveCount(item.id, { current_quantity: v })
                            }}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {(() => {
                            const q = needToBuy(item.original_quantity, counts[item.id]?.current_quantity ?? null)
                            return q > 0 ? <span className="font-semibold text-red-600">{q}</span> : <span className="text-slate-400">0</span>
                          })()}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={counts[item.id]?.ordered ?? false} onChange={(e) => saveCount(item.id, { ordered: e.target.checked })} />
                        </td>
                        {isDentist && (
                          <td className="px-3 py-1.5 text-right whitespace-nowrap text-xs">
                            <button onClick={() => handleInsertAbove(item)} title="Insert a row above" className="mr-2 text-slate-500 hover:underline">
                              +↑
                            </button>
                            <button onClick={() => handleMoveItem(item, -1)} disabled={ii === 0} className="mr-1 rounded px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                              ↑
                            </button>
                            <button onClick={() => handleMoveItem(item, 1)} disabled={ii === arr.length - 1} className="mr-2 rounded px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                              ↓
                            </button>
                            <button onClick={() => setEditingItemId(item.id)} className="mr-2 font-medium text-navy-700 hover:underline">
                              Edit
                            </button>
                            <button onClick={() => handleDeleteItem(item.id)} className="text-red-600 hover:underline">
                              Del
                            </button>
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                  {(itemsByCluster[cluster.id] ?? []).length === 0 && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={isDentist ? 7 : 6} className="px-3 py-2 text-xs text-slate-400">
                        No items in this location yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {isDentist && addingToCluster === cluster.id && (
                <form onSubmit={(e) => handleAddItem(e, cluster.id, (itemsByCluster[cluster.id]?.reduce((m, i) => Math.max(m, i.position), 0) ?? 0) + 1)} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
                  <input name="name" required placeholder="Item name" className={`${inputCls} flex-1`} />
                  <input name="brand" placeholder="Brand" className={inputCls} />
                  <input name="original_quantity" type="number" step="0.01" min="0" defaultValue={1} title="Target quantity" className={`${inputCls} w-24`} />
                  <button type="submit" className="rounded-lg bg-navy-900 px-3 py-1 text-xs font-medium text-white hover:bg-navy-800">
                    Add
                  </button>
                </form>
              )}
            </div>
          ))}

          {isDentist &&
            (showAddCluster ? (
              <form onSubmit={handleAddCluster} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <input name="name" required placeholder="New storage location (e.g. Room 3 Cabinet)" className={`${inputCls} flex-1`} />
                <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
                  Add location
                </button>
                <button type="button" onClick={() => setShowAddCluster(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
                  Cancel
                </button>
              </form>
            ) : (
              <button onClick={() => setShowAddCluster(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-navy-800 hover:bg-slate-50">
                + Add storage location
              </button>
            ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm text-slate-500">To order for {monthLabel}</p>
              <p className="text-2xl font-semibold text-navy-900">
                {orderLines.length} items · {totalToBuy} units
              </p>
            </div>
            <button
              onClick={() => exportOrderSummaryPdf(inventories.find((i) => i.id === inventoryId)?.name ?? 'Inventory', monthLabel, orderLines)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50"
            >
              Export order (PDF)
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {orderLines.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing to order — everything is at or above target.</p>}
            {clusters.map((c) => {
              const lines = orderLines.filter((l) => l.cluster === c.name)
              if (lines.length === 0) return null
              return (
                <div key={c.id}>
                  <p className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{c.name}</p>
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 last:border-0">
                      <p className="text-navy-900">
                        {l.name} {l.brand && <span className="text-xs text-slate-400">· {l.brand}</span>}
                      </p>
                      <p className="font-semibold text-navy-900">×{l.qty}</p>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
