import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { getSettings, updateSettings } from '../api/client.js'
import { PRESETS } from '../presets.js'

const SettingsContext = createContext(null)

const DEFAULTS = {
  distance_unit: 'mi', volume_unit: 'gal', currency_symbol: '$',
  date_format: 'MM/DD/YYYY', custom_services: '[]', version: '',
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)

  const refresh = useCallback(async () => {
    try {
      const data = await getSettings()
      setSettings((s) => ({ ...s, ...data }))
    } catch { /* keep defaults */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const money = useCallback((n) => {
    if (n == null) return '—'
    return `${settings.currency_symbol}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [settings.currency_symbol])

  const distance = useCallback((n) => {
    if (n == null) return '—'
    return `${Number(n).toLocaleString()} ${settings.distance_unit}`
  }, [settings.distance_unit])

  // Unit labels derived from settings — nothing should hardcode "mi"/"gal"/"mpg".
  const units = useMemo(() => {
    const d = settings.distance_unit, v = settings.volume_unit
    return { distance: d, volume: v, economy: d === 'mi' && v === 'gal' ? 'mpg' : `${d}/${v}` }
  }, [settings.distance_unit, settings.volume_unit])

  // User-defined service types, stored as a JSON array in settings.
  const customServices = useMemo(() => {
    try {
      const list = JSON.parse(settings.custom_services || '[]')
      return Array.isArray(list) ? list : []
    } catch { return [] }
  }, [settings.custom_services])

  // Built-in presets plus the user's own — the option list for service items and reminders.
  const serviceOptions = useMemo(() => [...PRESETS.service, ...customServices], [customServices])

  const saveCustomServices = useCallback(async (list) => {
    const updated = await updateSettings({ custom_services: JSON.stringify(list) })
    setSettings((s) => ({ ...s, ...updated }))
  }, [])

  const addCustomService = useCallback(async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const exists = [...PRESETS.service, ...customServices].some((s) => s.toLowerCase() === trimmed.toLowerCase())
    if (exists) return
    await saveCustomServices([...customServices, trimmed])
  }, [customServices, saveCustomServices])

  const removeCustomService = useCallback(async (name) => {
    await saveCustomServices(customServices.filter((s) => s !== name))
  }, [customServices, saveCustomServices])

  return (
    <SettingsContext.Provider value={{
      settings, setSettings, refresh, money, distance, units,
      customServices, serviceOptions, addCustomService, removeCustomService,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
