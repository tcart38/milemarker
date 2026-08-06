import React, { useState, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { Car, Settings as SettingsIcon, Sun, Moon, ChevronRight, ChevronDown, Check, Plus } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { getVehicles, attachmentUrl } from '../api/client.js'
import { vehicleTitle } from '../vehicles.js'

function ThemeButton({ className = '' }) {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} className={`btn-ghost ${className}`} title="Toggle theme" aria-label="Toggle theme">
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function Thumb({ v }) {
  if (v.photo_attachment_id) {
    return <img src={attachmentUrl(v.photo_attachment_id)} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
  }
  return (
    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
      v.is_archived ? 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-400' : 'bg-brand/10 text-brand'
    }`}>
      <Car size={15} />
    </div>
  )
}

// The breadcrumb doubles as a vehicle switcher on a vehicle page: the label you
// were already looking at becomes the thing you click to change cars.
function VehicleSwitcher({ vehicleId, label }) {
  const [vehicles, setVehicles] = useState([])
  const [open, setOpen] = useState(false)
  const [params] = useSearchParams()
  const ref = useRef(null)

  // Refetch when the vehicle changes, so a rename or a new car shows up here.
  useEffect(() => { getVehicles(true).then(setVehicles).catch(() => setVehicles([])) }, [vehicleId, label])

  useEffect(() => {
    if (!open) return
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', esc) }
  }, [open])

  // Land on the same tab you were on — switching cars to compare the same
  // thing is the whole point.
  const tab = params.get('tab')
  const href = (id) => `/vehicle/${id}${tab ? `?tab=${tab}` : ''}`

  const active = vehicles.filter((v) => !v.is_archived)
  const sold = vehicles.filter((v) => v.is_archived)

  const item = (v) => (
    <Link
      key={v.id}
      to={href(v.id)}
      onClick={() => setOpen(false)}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
        String(v.id) === String(vehicleId) ? 'text-brand font-medium' : ''
      }`}
    >
      <Thumb v={v} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{vehicleTitle(v)}</span>
        {v.odometer != null && (
          <span className="block text-[11px] text-slate-400 tabular-nums">{v.odometer.toLocaleString()}</span>
        )}
      </span>
      {String(v.id) === String(vehicleId) && <Check size={14} className="flex-shrink-0" />}
    </Link>
  )

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 min-w-0 px-1.5 py-1 -mx-1 rounded-lg
                   hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
      >
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{label}</span>
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 max-h-[70vh] overflow-y-auto card p-1 shadow-xl z-40" role="menu">
          {active.map(item)}
          {sold.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-400">Sold</p>
              {sold.map(item)}
            </>
          )}
          <div className="border-t border-slate-200 dark:border-white/[0.06] mt-1 pt-1">
            <Link to="/garage" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
              <Car size={15} className="flex-shrink-0" /> All vehicles
            </Link>
            <Link to="/garage?add=1" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
              <Plus size={15} className="flex-shrink-0" /> Add a vehicle
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  // Pages set a breadcrumb label via the outlet context; cleared on unmount.
  const [crumb, setCrumb] = useState(null)
  const vehicleMatch = useMatch('/vehicle/:id')
  const vehicleId = vehicleMatch?.params?.id ?? null

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      <header className="flex items-center gap-2 px-3 sm:px-4 h-14 flex-shrink-0 z-30
                         bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-white/[0.06]">
        <Link to="/garage" className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <Car size={18} className="text-brand flex-shrink-0" />
          <span className="text-base font-semibold tracking-tight">MileMarker</span>
        </Link>

        {crumb && (
          <div className="flex items-center gap-1 min-w-0 text-slate-400">
            <ChevronRight size={15} className="flex-shrink-0" />
            {vehicleId
              ? <VehicleSwitcher vehicleId={vehicleId} label={crumb} />
              : <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{crumb}</span>}
          </div>
        )}

        <div className="flex-1" />

        <ThemeButton />
        <NavLink
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={({ isActive }) =>
            `btn-ghost ${isActive ? 'text-brand hover:text-brand' : ''}`
          }
        >
          <SettingsIcon size={16} />
        </NavLink>
      </header>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet context={{ setCrumb }} />
      </main>
    </div>
  )
}
