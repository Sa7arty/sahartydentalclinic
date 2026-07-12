import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-navy-700">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return children
}
