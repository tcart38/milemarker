import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'

// A text input with a searchable dropdown of presets. The typed value IS the
// value, so custom entries work — the list is just for quick selection.
export default function Combobox({ value, onChange, options = [], placeholder, autoFocus }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const q = (value || '').toLowerCase().trim()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="pr-8"
      />
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 rounded-2xl bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 max-h-56 overflow-y-auto animate-in fade-in-0 zoom-in-95">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false) }}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
