import React from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

// App-wide form dialog. Callers mount it to open it and unmount it to close
// it, so it's always `open` here and any dismissal (Esc, backdrop, the close
// button) routes through `onClose`.
export default function Modal({ title, onClose, children, footer, className }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className={`flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-lg ${className ?? ''}`}
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <DialogFooter className="flex-row justify-end border-t px-5 py-3">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
