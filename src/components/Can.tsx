import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { PermissionAction } from '../lib/permissions'

/** Renders children only if the signed-in staff member's group is allowed this
 * action on this resource (Settings → Security). The dentist role always passes. */
export default function Can({
  resource,
  action,
  children,
  fallback = null,
}: {
  resource: string
  action: PermissionAction
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can } = useAuth()
  return <>{can(resource, action) ? children : fallback}</>
}
