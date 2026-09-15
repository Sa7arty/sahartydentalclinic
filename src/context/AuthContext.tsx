import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AppRole, PageKey, DEFAULT_PAGE_ACCESS, UserPageAccess } from '../types'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  roles: AppRole[]
  locationIds: string[]
  isDentist: boolean
  isFrontDesk: boolean
  /** Can the current user open this page? The dentist role always can. */
  canAccess: (page: PageKey) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [pageAccess, setPageAccess] = useState<Record<string, boolean>>({})
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
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadStaffContext(userId: string) {
    setLoading(true)
    const [{ data: roleRows }, { data: locRows }, { data: accessRows }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('staff_locations').select('location_id').eq('user_id', userId),
      supabase.from('user_page_access').select('page, allowed').eq('user_id', userId),
    ])
    setRoles((roleRows ?? []).map((r) => r.role as AppRole))
    setLocationIds((locRows ?? []).map((l) => l.location_id as string))
    setPageAccess(Object.fromEntries((accessRows ?? []).map((r) => [(r as UserPageAccess).page, (r as UserPageAccess).allowed])))
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
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
