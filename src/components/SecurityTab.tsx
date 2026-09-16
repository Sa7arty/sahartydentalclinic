import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/confirmDialog'
import { PERMISSION_RESOURCES, PermissionAction, StaffGroup, GroupPermission } from '../lib/permissions'

const ACTION_LABELS: Record<PermissionAction, string> = { view: 'View', edit: 'Edit', delete: 'Delete' }
const FLAG_KEY: Record<PermissionAction, 'can_view' | 'can_edit' | 'can_delete'> = {
  view: 'can_view',
  edit: 'can_edit',
  delete: 'can_delete',
}

/**
 * Settings → Security: who can View/Edit/Delete what. Dentists always have
 * full access everywhere and aren't a configurable group here — this only
 * governs everyone else, organized into staff groups the owner names and
 * assigns people to (in HR), like "Front Desk / Receptionist" or "Dental Assistant".
 */
export default function SecurityTab() {
  const [groups, setGroups] = useState<StaffGroup[]>([])
  const [permissions, setPermissions] = useState<GroupPermission[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: groupRows }, { data: permRows }] = await Promise.all([
      supabase.from('staff_groups').select('*').order('name'),
      supabase.from('group_permissions').select('*'),
    ])
    const loadedGroups = (groupRows as StaffGroup[]) ?? []
    setGroups(loadedGroups)
    setPermissions((permRows as GroupPermission[]) ?? [])
    setSelectedGroupId((cur) => cur ?? loadedGroups[0]?.id ?? null)
    setLoading(false)
  }

  async function handleAddGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    const { data, error } = await supabase.from('staff_groups').insert({ name }).select().single()
    if (error) return alert(error.message)
    setNewGroupName('')
    await load()
    if (data) setSelectedGroupId((data as StaffGroup).id)
  }

  async function handleRenameGroup(id: string, name: string) {
    if (!name.trim()) return
    const { error } = await supabase.from('staff_groups').update({ name: name.trim() }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function handleDeleteGroup(group: StaffGroup) {
    if (!(await confirmDialog(`Delete the "${group.name}" group? Any staff currently in it will need to be reassigned to another group in HR.`))) return
    const { error } = await supabase.from('staff_groups').delete().eq('id', group.id)
    if (error) return alert(error.message)
    if (selectedGroupId === group.id) setSelectedGroupId(null)
    load()
  }

  async function handleToggle(resourceKey: string, action: PermissionAction, checked: boolean) {
    if (!selectedGroupId) return
    const groupId = selectedGroupId
    const existing = permissions.find((p) => p.group_id === groupId && p.resource_key === resourceKey)
    const nextRow: GroupPermission = {
      group_id: groupId,
      resource_key: resourceKey,
      can_view: existing?.can_view ?? false,
      can_edit: existing?.can_edit ?? false,
      can_delete: existing?.can_delete ?? false,
      [FLAG_KEY[action]]: checked,
    }
    setPermissions((cur) => {
      const found = cur.some((p) => p.group_id === groupId && p.resource_key === resourceKey)
      return found ? cur.map((p) => (p.group_id === groupId && p.resource_key === resourceKey ? nextRow : p)) : [...cur, nextRow]
    })
    const { error } = await supabase.from('group_permissions').upsert(nextRow, { onConflict: 'group_id,resource_key' })
    if (error) {
      alert(error.message)
      load()
    }
  }

  const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className={card}>
        <div>
          <h2 className="font-medium text-navy-900">Staff groups</h2>
          <p className="text-sm text-slate-500">Dentists always have full access everywhere. Set up a group for every other type of staff — front desk, assistants, and so on — then assign each employee to one in HR.</p>
        </div>
        <form onSubmit={handleAddGroup} className="flex flex-wrap items-end gap-3">
          <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Dental Assistant" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">
            + Add group
          </button>
        </form>
        {groups.length === 0 && <p className="text-sm text-slate-500">No groups yet — add one above.</p>}
        <div className="divide-y divide-slate-100">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-3 py-2">
              <input
                defaultValue={g.name}
                onBlur={(e) => e.target.value !== g.name && handleRenameGroup(g.id, e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => setSelectedGroupId(g.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  selectedGroupId === g.id ? 'bg-gold-500 text-navy-950' : 'border border-slate-300 text-navy-800 hover:bg-slate-50'
                }`}
              >
                {selectedGroupId === g.id ? 'Editing permissions' : 'Edit permissions'}
              </button>
              <button onClick={() => handleDeleteGroup(g)} title="Delete group" className="rounded-lg px-2 py-2 text-slate-400 hover:bg-red-100 hover:text-red-600">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedGroup && (
        <div className={card}>
          <div>
            <h2 className="font-medium text-navy-900">What can "{selectedGroup.name}" do?</h2>
            <p className="text-sm text-slate-500">Tick View, Edit, and Delete for each item. Unticked means that group can't do it at all.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Item</th>
                  <th className="w-20 py-2 text-center">View</th>
                  <th className="w-20 py-2 text-center">Edit</th>
                  <th className="w-20 py-2 text-center">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSION_RESOURCES.map((r) => {
                  const row = permissions.find((p) => p.group_id === selectedGroup.id && p.resource_key === r.key)
                  return (
                    <tr key={r.key}>
                      <td className="py-2 pr-3 text-navy-900">{r.label}</td>
                      {(['view', 'edit', 'delete'] as PermissionAction[]).map((action) => (
                        <td key={action} className="py-2 text-center">
                          {r.actions.includes(action) ? (
                            <input
                              type="checkbox"
                              aria-label={`${ACTION_LABELS[action]} ${r.label}`}
                              checked={row ? row[FLAG_KEY[action]] : false}
                              onChange={(e) => handleToggle(r.key, action, e.target.checked)}
                              className="h-4 w-4"
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
