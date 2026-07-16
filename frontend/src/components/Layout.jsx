import React, { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Car, Settings as SettingsIcon, Sun, Moon, ChevronRight } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'

function ThemeButton({ className = '' }) {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} className={`btn-ghost ${className}`} title="Toggle theme" aria-label="Toggle theme">
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

export default function Layout() {
  // Pages set a breadcrumb label via the outlet context; cleared on unmount.
  const [crumb, setCrumb] = useState(null)

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
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{crumb}</span>
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
