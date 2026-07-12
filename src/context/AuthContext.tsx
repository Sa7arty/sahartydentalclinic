import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AppRole } from '../types'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  roles: AppRole[]
  locationIds: string[]
  isDentist: boolean
  isFrontDesk: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [locationIds, setLocationIds] = useState<string[]>([])
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
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadStaffContext(userId: string) {
    setLoading(true)
    const [{ data: roleRows }, { data: locRows }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('staff_locations').select('location_id').eq('user_id', userId),
    ])
    setRoles((roleRows ?? []).map((r) => r.role as AppRole))
    setLocationIds((locRows ?? []).map((l) => l.location_id as string))
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value: AuthContextValue = {
    session,
    loading,
    roles,
    locationIds,
    isDentist: roles.includes('dentist'),
    isFrontDesk: roles.includes('front_desk'),
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
