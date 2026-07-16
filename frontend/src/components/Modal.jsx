import React, { useEffect } from 'react'
import { X } from 'lucide-react'

// Centered on desktop, bottom sheet on mobile. Closes on backdrop click or Esc.
export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl rounded-b-none sm:rounded-xl
                   pb-[env(safe-area-inset-bottom)] sm:pb-0 animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-slate-200 dark:border-white/[0.06]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        {footer && (
          <div className="flex-shrink-0 flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-white/[0.06]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
