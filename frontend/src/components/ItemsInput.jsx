import React, { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

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
      <div className="flex min-h-8 h-auto w-full flex-wrap items-center gap-1.5 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        {value.map((item) => (
          <Badge key={item} variant="secondary" className="gap-1 pr-1">
            {item}
            <Tooltip>
              <TooltipTrigger
                render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${item}`} onClick={() => remove(item)} className="size-4 rounded-full hover:text-destructive [&_svg]:size-3" />}
              >
                <X />
              </TooltipTrigger>
              <TooltipContent>{`Remove ${item}`}</TooltipContent>
            </Tooltip>
          </Badge>
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
          aria-label={placeholder}
          className="flex-1 min-w-[8ch] bg-transparent outline-none text-sm py-0.5 placeholder:text-muted-foreground"
        />
      </div>
      {open && (filtered.length > 0 || q) && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-2xl bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 p-1.5 max-h-56 overflow-y-auto animate-in fade-in-0 zoom-in-95">
          {q && !has(text) && (
            <Button type="button" variant="ghost" onClick={() => add(text)} className="w-full justify-start font-normal">
              <Plus className="text-primary" /> Add “{text.trim()}”
            </Button>
          )}
          {filtered.map((o) => (
            <Button key={o} type="button" variant="ghost" onClick={() => add(o)} className="w-full justify-start font-normal">
              {o}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
