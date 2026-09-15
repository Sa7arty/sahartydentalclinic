import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    // Usernames aren't a native Supabase Auth concept — resolve to the real
    // email behind the scenes first, then sign in as usual.
    const { data: email, error: lookupErr } = await supabase.rpc('get_email_for_username', { p_username: username })
    if (lookupErr || !email) {
      setSubmitting(false)
      setError('Incorrect username or password.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setError('Incorrect username or password.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-navy-900 p-8 shadow-xl">
        <p className="mb-1 text-center text-xl font-semibold text-white">SAHARTY</p>
        <p className="mb-8 text-center text-sm text-gold-400">Staff Portal</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Username</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-white focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-white focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gold-500 px-4 py-2 font-medium text-navy-950 transition-colors hover:bg-gold-400 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are created by an admin — there's no self-signup here.
        </p>
      </div>
    </div>
  )
}
