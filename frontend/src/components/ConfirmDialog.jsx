import React, { useEffect } from 'react'

// Small confirmation dialog for destructive actions.
export default function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div className="card p-4 max-w-sm w-full space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} className="btn-danger">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
