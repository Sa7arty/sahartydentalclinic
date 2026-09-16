import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AppRole, PageKey, DEFAULT_PAGE_ACCESS, UserPageAccess } from '../types'
import { GroupPermission, PermissionAction } from '../lib/permissions'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  roles: AppRole[]
  locationIds: string[]
  isDentist: boolean
  isFrontDesk: boolean
  /** Can the current user open this page? The dentist role always can. */
  canAccess: (page: PageKey) => boolean
  /** Can the current user View/Edit/Delete this specific item (Settings → Security)?
   * The dentist role always can; everyone else is governed by their staff group's
   * permissions, defaulting to false for anything not explicitly granted. */
  can: (resource: string, action: PermissionAction) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [pageAccess, setPageAccess] = useState<Record<string, boolean>>({})
  const [groupPermissions, setGroupPermissions] = useState<GroupPermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadStaffContext(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadStaffContext(newSession.user.id)
      else {
        setRoles([])
        setLocationIds([])
        setPageAccess({})
        setGroupPermissions([])
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadStaffContext(userId: string) {
    setLoading(true)
    const [{ data: roleRows }, { data: locRows }, { data: accessRows }, { data: employeeRow }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('staff_locations').select('location_id').eq('user_id', userId),
      supabase.from('user_page_access').select('page, allowed').eq('user_id', userId),
      supabase.from('employees').select('group_id').eq('user_id', userId).maybeSingle(),
    ])
    setRoles((roleRows ?? []).map((r) => r.role as AppRole))
    setLocationIds((locRows ?? []).map((l) => l.location_id as string))
    setPageAccess(Object.fromEntries((accessRows ?? []).map((r) => [(r as UserPageAccess).page, (r as UserPageAccess).allowed])))
    const groupId = (employeeRow as { group_id: string | null } | null)?.group_id
    if (groupId) {
      const { data: permRows } = await supabase.from('group_permissions').select('*').eq('group_id', groupId)
      setGroupPermissions((permRows as GroupPermission[]) ?? [])
    } else {
      setGroupPermissions([])
    }
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isDentist = roles.includes('dentist')
  const value: AuthContextValue = {
    session,
    loading,
    roles,
    locationIds,
    isDentist,
    isFrontDesk: roles.includes('front_desk'),
    canAccess: (page) => isDentist || (pageAccess[page] ?? DEFAULT_PAGE_ACCESS[page]),
    can: (resource, action) => {
      if (isDentist) return true
      const row = groupPermissions.find((p) => p.resource_key === resource)
      if (!row) return false
      if (action === 'view') return row.can_view
      if (action === 'edit') return row.can_edit
      return row.can_delete
    },
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
