import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { AppRole } from '../types'

/** Renders children only if the signed-in staff member has one of the allowed roles. */
export default function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: AppRole[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { roles } = useAuth()
  const permitted = roles.some((r) => allow.includes(r))
  return <>{permitted ? children : fallback}</>
}
