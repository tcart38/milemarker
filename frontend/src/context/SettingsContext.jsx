import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { getSettings, getServiceTypes } from '../api/client.js'

const SettingsContext = createContext(null)

const DEFAULTS = {
  distance_unit: 'mi', volume_unit: 'gal', currency_symbol: '$',
  date_format: 'MM/DD/YYYY', version: '',
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [serviceTypes, setServiceTypes] = useState([])

  const refresh = useCallback(async () => {
    try {
      const data = await getSettings()
      setSettings((s) => ({ ...s, ...data }))
    } catch { /* keep defaults */ }
  }, [])

  // Service types live in the database; forms and Settings share this list.
  const refreshServiceTypes = useCallback(async () => {
    try { setServiceTypes(await getServiceTypes()) } catch { /* offline — keep last */ }
  }, [])

  useEffect(() => { refresh(); refreshServiceTypes() }, [refresh, refreshServiceTypes])

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

  // Names offered in the service-item and reminder comboboxes.
  const serviceOptions = useMemo(() => serviceTypes.map((t) => t.name), [serviceTypes])

  return (
    <SettingsContext.Provider value={{
      settings, setSettings, refresh, money, distance, units,
      serviceTypes, serviceOptions, refreshServiceTypes,
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
