import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getAuthStatus, login as apiLogin, logout as apiLogout, UNAUTHORIZED_EVENT } from '../api/client.js'

const AuthContext = createContext(null)

// Drop the service worker's cached API responses, so a signed-out device
// can't show the garage offline.
async function clearCachedData() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map((k) => caches.delete(k)))
}

export function AuthProvider({ children }) {
  // null until the first status check answers
  const [status, setStatus] = useState(null)

  const refresh = useCallback(async () => {
    try { setStatus(await getAuthStatus()) }
    // Status unreachable (offline, old server): don't lock the user out of the cached app.
    catch { setStatus((s) => s ?? { enabled: false, authenticated: true }) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const onUnauthorized = () => setStatus((s) => (s?.enabled ? { ...s, authenticated: false, username: null } : s))
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const login = useCallback(async (username, password) => {
    setStatus(await apiLogin(username, password))
  }, [])

  const logout = useCallback(async () => {
    try { await apiLogout() } finally {
      await clearCachedData().catch(() => {})
      setStatus((s) => ({ ...s, authenticated: false, username: null }))
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
