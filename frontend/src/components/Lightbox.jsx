import React, { useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { attachmentUrl } from '../api/client.js'

const isImage = (name) => /\.(jpe?g|png|gif|webp|heic)$/i.test(name || '')

// View a receipt inside the app. `src` overrides the URL (for un-uploaded
// local previews); otherwise it streams the stored attachment by id.
export default function Lightbox({ attachment, src, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const url = src || attachmentUrl(attachment.id)
  const img = isImage(attachment.filename)

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col p-4 sm:p-8" onClick={onClose}>
      <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {attachment.id && (
          <Button variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" nativeButton={false} render={<a href={url} download={attachment.filename} />}><Download /> Download</Button>
        )}
        <Button variant="ghost" onClick={onClose} className="text-white/80 hover:bg-white/10 hover:text-white"><X /> Close</Button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {img ? (
          <img src={url} alt={attachment.filename} className="max-w-full max-h-full object-contain rounded-lg" />
        ) : (
          <iframe src={url} title={attachment.filename} className="w-full h-full bg-white rounded-lg" />
        )}
      </div>
      <p className="text-center text-xs text-white/60 mt-3 flex-shrink-0 truncate">{attachment.filename}</p>
    </div>
  )
}
