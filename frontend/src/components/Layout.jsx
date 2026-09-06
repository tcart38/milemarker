import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { Car, Settings as SettingsIcon, Sun, Moon, ChevronRight, ChevronDown, Check, Plus } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { getVehicles, attachmentUrl } from '../api/client.js'
import { vehicleTitle } from '../vehicles.js'

function ThemeButton({ className = '' }) {
  const { resolved, toggle } = useTheme()
  return (
    <button onClick={toggle} className={`btn-icon ${className}`} title="Toggle theme" aria-label="Toggle theme">
      {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

// Literal class names per size — Tailwind's scanner never sees interpolated ones.
const THUMB = {
  sm: { box: 'w-7 h-7 rounded-md', icon: 15 },
  lg: { box: 'w-9 h-9 rounded-lg', icon: 18 },
}

function Thumb({ v, size = 'sm' }) {
  const { box, icon } = THUMB[size]
  if (v.photo_attachment_id) {
    return <img src={attachmentUrl(v.photo_attachment_id)} alt="" className={`${box} object-cover flex-shrink-0`} />
  }
  return (
    <div className={`${box} flex items-center justify-center flex-shrink-0 ${
      v.is_archived ? 'bg-wash/[0.08] text-tertiary' : 'bg-accent/10 text-accent'
    }`}>
      <Car size={icon} />
    </div>
  )
}

/**
 * Picks the car you're looking at. Two shapes for two places: `crumb` is the
 * inline breadcrumb in the mobile top bar, `sidebar` is the wider control that
 * heads the desktop nav panel.
 */
function VehicleSwitcher({ vehicleId, label, variant = 'crumb' }) {
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
  const current = vehicles.find((v) => String(v.id) === String(vehicleId))

  const item = (v) => (
    <Link
      key={v.id}
      to={href(v.id)}
      onClick={() => setOpen(false)}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm hover:bg-wash/[0.06] ${
        String(v.id) === String(vehicleId) ? 'text-accent font-medium' : ''
      }`}
    >
      <Thumb v={v} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{vehicleTitle(v)}</span>
        {v.odometer != null && (
          <span className="block text-xs text-tertiary num">{v.odometer.toLocaleString()}</span>
        )}
      </span>
      {String(v.id) === String(vehicleId) && <Check size={14} className="flex-shrink-0" />}
    </Link>
  )

  const menu = (
    <div className="absolute left-0 right-0 top-full mt-1.5 min-w-[16rem] max-h-[70vh] overflow-y-auto pop p-1.5 z-40 animate-pop" role="menu">
      {active.map(item)}
      {sold.length > 0 && (
        <>
          <p className="px-2 pt-2.5 pb-1 text-xs font-medium text-tertiary">Sold</p>
          {sold.map(item)}
        </>
      )}
      <div className="border-t border-hairline/50 mt-1.5 pt-1.5">
        <Link to="/garage" onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-secondary hover:bg-wash/[0.06]">
          <Car size={15} className="flex-shrink-0" /> All vehicles
        </Link>
        <Link to="/garage?add=1" onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-secondary hover:bg-wash/[0.06]">
          <Plus size={15} className="flex-shrink-0" /> Add a vehicle
        </Link>
      </div>
    </div>
  )

  if (variant === 'sidebar') {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-surface hover:bg-wash/[0.05]
                     shadow-card dark:shadow-none transition-colors text-left"
        >
          {current ? <Thumb v={current} size="lg" /> : <span className="w-9 h-9 rounded-lg bg-inset flex-shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold truncate">{label}</span>
            {current?.odometer != null && (
              <span className="block text-xs text-secondary num">{current.odometer.toLocaleString()}</span>
            )}
          </span>
          <ChevronDown size={15} className={`flex-shrink-0 text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && menu}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 min-w-0 px-2 py-1 -mx-1 rounded-lg
                   hover:bg-wash/[0.07] transition-colors duration-150"
      >
        <span className="text-sm font-medium text-primary truncate">{label}</span>
        <ChevronDown size={14} className={`flex-shrink-0 text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menu}
    </div>
  )
}

export default function Layout() {
  // Pages publish their breadcrumb label and their section nav through the
  // outlet context; both are cleared on unmount. Hoisting the nav up here is
  // what lets the vehicle's own tabs live in the app-wide sidebar on desktop.
  const [crumb, setCrumb] = useState(null)
  const [nav, setNav] = useState(null)
  const vehicleMatch = useMatch('/vehicle/:id')
  const vehicleId = vehicleMatch?.params?.id ?? null

  const outlet = React.useMemo(() => ({ setCrumb, setNav }), [setCrumb, setNav])

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Desktop nav panel. Below lg the same choices live in the top bar and
          the segmented control on the page itself. */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-hairline/40 bg-canvas">
        <Link to="/garage" className="flex items-center gap-2 h-14 px-4 flex-shrink-0">
          <Car size={18} className="text-accent flex-shrink-0" />
          <span className="text-base font-semibold tracking-tight">MileMarker</span>
        </Link>

        {vehicleId && crumb && (
          <div className="px-3 pb-3 flex-shrink-0">
            <VehicleSwitcher vehicleId={vehicleId} label={crumb} variant="sidebar" />
          </div>
        )}

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-0.5">
          {nav?.items?.length ? (
            nav.items.map((t) => (
              <button
                key={t.key}
                onClick={() => nav.onSelect(t.key)}
                aria-current={nav.active === t.key ? 'page' : undefined}
                className={`side-item ${nav.active === t.key ? 'side-item-on' : ''}`}
              >
                <t.icon size={16} className="flex-shrink-0" />
                {t.label}
              </button>
            ))
          ) : (
            <NavLink to="/garage" className={({ isActive }) => `side-item ${isActive ? 'side-item-on' : ''}`}>
              <Car size={16} className="flex-shrink-0" /> Garage
            </NavLink>
          )}
        </nav>

        <div className="flex-shrink-0 border-t border-hairline/40 p-3 space-y-0.5">
          {nav?.items?.length ? (
            <Link to="/garage" className="side-item">
              <Car size={16} className="flex-shrink-0" /> All vehicles
            </Link>
          ) : null}
          <NavLink to="/settings" className={({ isActive }) => `side-item ${isActive ? 'side-item-on' : ''}`}>
            <SettingsIcon size={16} className="flex-shrink-0" /> Settings
          </NavLink>
          <ThemeToggleRow />
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile / tablet top bar. */}
        <header className="lg:hidden flex items-center gap-1.5 px-3 sm:px-5 h-12 flex-shrink-0 z-30
                           bg-canvas border-b border-hairline/40">
          <Link to="/garage" className="flex items-center gap-2 flex-shrink-0 min-w-0 pr-1">
            <Car size={17} className="text-accent flex-shrink-0" />
            <span className="text-sm font-semibold tracking-tight">MileMarker</span>
          </Link>

          {crumb && (
            <div className="flex items-center gap-0.5 min-w-0 text-tertiary">
              <ChevronRight size={14} className="flex-shrink-0" />
              {vehicleId
                ? <VehicleSwitcher vehicleId={vehicleId} label={crumb} />
                : <span className="text-sm font-medium text-primary truncate">{crumb}</span>}
            </div>
          )}

          <div className="flex-1" />

          <ThemeButton />
          <NavLink
            to="/settings"
            title="Settings"
            aria-label="Settings"
            className={({ isActive }) => `btn-icon ${isActive ? 'text-accent hover:text-accent' : ''}`}
          >
            <SettingsIcon size={17} />
          </NavLink>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet context={outlet} />
        </main>
      </div>
    </div>
  )
}

// Appearance sits in the sidebar footer on desktop, where there's room to name it.
function ThemeToggleRow() {
  const { resolved, toggle } = useTheme()
  return (
    <button onClick={toggle} className="side-item">
      {resolved === 'dark' ? <Sun size={16} className="flex-shrink-0" /> : <Moon size={16} className="flex-shrink-0" />}
      {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
