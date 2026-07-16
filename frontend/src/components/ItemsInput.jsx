import React, { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'

// Multi-item chip input: pick from presets or type custom; each entry becomes a
// removable chip. `value` is an array of strings.
export default function ItemsInput({ value = [], onChange, options = [], placeholder = 'Add an item…' }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const has = (v) => value.some((x) => x.toLowerCase() === v.toLowerCase())
  const add = (item) => {
    const v = item.trim()
    if (v && !has(v)) onChange([...value, v])
    setText(''); setOpen(false)
  }
  const remove = (item) => onChange(value.filter((x) => x !== item))

  const q = text.toLowerCase().trim()
  const filtered = options.filter((o) => o.toLowerCase().includes(q) && !has(o))

  return (
    <div ref={ref} className="relative">
      <div className="input flex flex-wrap gap-1.5 items-center min-h-[2.5rem] h-auto py-1.5">
        {value.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 bg-brand/10 text-brand rounded-md pl-2 pr-1 py-0.5 text-xs font-medium">
            {item}
            <button type="button" onClick={() => remove(item)} className="hover:text-red-400"><X size={11} /></button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text) }
            if (e.key === 'Backspace' && !text && value.length) remove(value[value.length - 1])
          }}
          placeholder={value.length ? '' : placeholder}
          className="flex-1 min-w-[8ch] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {open && (filtered.length > 0 || q) && (
        <div className="absolute z-30 left-0 right-0 mt-1 card p-1 max-h-52 overflow-y-auto shadow-xl">
          {q && !has(text) && (
            <button type="button" onClick={() => add(text)}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5">
              <Plus size={12} className="text-brand" /> Add “{text.trim()}”
            </button>
          )}
          {filtered.map((o) => (
            <button key={o} type="button" onClick={() => add(o)}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
