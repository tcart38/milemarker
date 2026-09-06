import React, { useEffect } from 'react'

// The Apple alert: narrow, centred, message first, destructive action in red.
export default function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-fade"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="bg-elevated shadow-pop rounded-2xl max-w-xs w-full p-5 text-center animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-primary">{message}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="btn bg-inset text-primary hover:brightness-95 dark:hover:brightness-125 flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-danger flex-1">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
