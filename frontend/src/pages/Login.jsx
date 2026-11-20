import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Shown in place of the whole app when login is enabled and there's no session.
export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await login(username, password) }
    catch (err) { setError(err.message); setPassword('') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <h1 className="title-lg">MileMarker</h1>
        </div>
        <div>
          <label className="label" htmlFor="login-user">Username</label>
          <input id="login-user" className="input" autoComplete="username" autoCapitalize="none"
            autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" className="input" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
