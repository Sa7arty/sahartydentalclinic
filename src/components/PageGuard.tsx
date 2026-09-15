import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageKey } from '../types'

/** Blocks a route by direct URL too, not just by hiding its nav link —
 * the nav hiding in Layout.tsx alone doesn't stop someone who knows/guesses
 * the address from opening the page. */
export default function PageGuard({ page, children }: { page: PageKey; children: JSX.Element }) {
  const { canAccess, loading } = useAuth()
  if (loading) return null
  if (!canAccess(page)) return <Navigate to="/" replace />
  return children
}
