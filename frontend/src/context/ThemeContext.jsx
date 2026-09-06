import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const ThemeContext = createContext(null)

// 'system' follows the OS the way an Apple app does; 'light'/'dark' pin it.
const THEMES = ['system', 'light', 'dark']
const query = () => window.matchMedia('(prefers-color-scheme: dark)')

const readStored = () => {
  const v = localStorage.getItem('theme')
  return THEMES.includes(v) ? v : 'system'
}

const apply = (resolved) => {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  // Keep the browser chrome (iOS status bar, Android toolbar) in step with the
  // canvas, otherwise the installed PWA shows a mismatched band at the top.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#f2f2f7')
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored)
  const [systemDark, setSystemDark] = useState(() => query().matches)

  // Track the OS preference so 'system' re-resolves live, without a reload.
  useEffect(() => {
    const mq = query()
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => { apply(resolved) }, [resolved])

  const setTheme = useCallback((next) => {
    const v = THEMES.includes(next) ? next : 'system'
    localStorage.setItem('theme', v)
    setThemeState(v)
  }, [])

  // The header button is a straight light/dark flip; picking 'system' is a
  // deliberate choice made in Settings.
  const toggle = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setTheme]
  )

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
