import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVehicles } from '../api/client.js'

// Target of the "Log fuel" PWA shortcut: jump straight into the fuel form for the
// last-used vehicle (or the only one), falling back to the garage to pick.
export default function QuickFuel() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    getVehicles().then((vehicles) => {
      if (cancelled) return
      const lastId = localStorage.getItem('mm.lastVehicleId')
      const target = vehicles.find((v) => String(v.id) === lastId) || (vehicles.length === 1 ? vehicles[0] : null)
      if (target) navigate(`/vehicle/${target.id}?tab=fuel&add=1`, { replace: true })
      else navigate('/garage', { replace: true })
    }).catch(() => navigate('/garage', { replace: true }))
    return () => { cancelled = true }
  }, [navigate])

  return <div className="p-6 text-slate-400">Loading…</div>
}
