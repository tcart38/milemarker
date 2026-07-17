import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Paperclip, FileText, Trash2 } from 'lucide-react'
import { getAttachments, deleteAttachment, attachmentUrl } from '../api/client.js'
import Lightbox from './Lightbox.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

const isImage = (name) => /\.(jpe?g|png|gif|webp|heic)$/i.test(name || '')

// Attachment manager for a record form. Existing attachments (edit mode) are
// deleted immediately; newly picked files are staged in `pending` and uploaded
// by the parent form on save.
export default function RecordAttachments({ vehicleId, recordType, recordId, pending, setPending }) {
  const [existing, setExisting] = useState([])
  const [view, setView] = useState(null) // { attachment, src? } for the lightbox
  const [toDelete, setToDelete] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const load = useCallback(() => {
    if (recordId) getAttachments(vehicleId, recordType, recordId).then(setExisting)
  }, [vehicleId, recordType, recordId])
  useEffect(() => { load() }, [load])

  // Local object URLs for previewing staged (not-yet-uploaded) files.
  const [previews, setPreviews] = useState([])
  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [pending])

  const addFiles = (files) => setPending([...pending, ...Array.from(files)])
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }
  const removePending = (i) => setPending(pending.filter((_, idx) => idx !== i))
  const removeExisting = async (id) => { await deleteAttachment(id); load() }

  const Thumb = ({ name, url, onClick }) => (
    <button type="button" onClick={onClick} className="w-9 h-9 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
      {isImage(name) && url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <FileText size={15} className="text-slate-500" />}
    </button>
  )

  return (
    <div>
      <label className="label">Receipts & documents</label>
      <div className="space-y-1.5">
        {existing.map((a) => (
          <div key={`e${a.id}`} className="flex items-center gap-2">
            <Thumb name={a.filename} url={attachmentUrl(a.id)} onClick={() => setView({ attachment: a })} />
            <span className="text-sm truncate flex-1">{a.filename}</span>
            <button type="button" onClick={() => setToDelete(a)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={`p${i}`} className="flex items-center gap-2">
            <Thumb name={f.name} url={previews[i]} onClick={() => setView({ attachment: { filename: f.name }, src: previews[i] })} />
            <span className="text-sm truncate flex-1">{f.name} <span className="text-[11px] text-slate-400">· pending</span></span>
            <button type="button" onClick={() => removePending(i)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-1.5 flex items-center justify-center gap-1.5 border-2 border-dashed rounded-lg py-2.5 text-xs cursor-pointer transition-colors ${
          dragging
            ? 'border-brand bg-brand/5 text-brand'
            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand hover:text-brand'
        }`}
      >
        <Paperclip size={13} /> {dragging ? 'Drop to attach' : <>Drop files or <span className="font-medium">attach receipt</span></>}
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }} />

      {view && <Lightbox attachment={view.attachment} src={view.src} onClose={() => setView(null)} />}
      {toDelete && (
        <ConfirmDialog
          message={`Delete “${toDelete.filename}”?`}
          onConfirm={async () => { await removeExisting(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
