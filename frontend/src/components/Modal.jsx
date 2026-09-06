import React, { useEffect } from 'react'
import { X } from 'lucide-react'

// Centred card on desktop, bottom sheet on mobile — the iOS presentation, with
// a grabber to signal the sheet is dismissible. Closes on backdrop click or Esc.
export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // The page behind shouldn't scroll while a sheet is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-6 animate-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-elevated shadow-pop w-full sm:max-w-lg max-h-[92dvh] flex flex-col
                   rounded-t-3xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0 animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber — mobile only, where the sheet is drag-dismissible in feel. */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <span className="w-9 h-1 rounded-full bg-hairline" />
        </div>

        <div className="flex items-center gap-3 px-4 sm:px-5 h-14 flex-shrink-0 border-b border-hairline/40">
          <h3 className="title-sm truncate flex-1">{title}</h3>
          <button onClick={onClose} className="btn-icon -mr-2 flex-shrink-0" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">{children}</div>

        {footer && (
          <div className="flex-shrink-0 flex justify-end gap-2 px-4 sm:px-5 py-3 border-t border-hairline/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
