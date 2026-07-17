import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, FileText, Trash2 } from 'lucide-react'
import { getAttachments, uploadAttachment, deleteAttachment, attachmentUrl } from '../api/client.js'
import Modal from './Modal.jsx'
import Lightbox from './Lightbox.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

const isImage = (name) => /\.(jpe?g|png|gif|webp|heic)$/i.test(name)

export default function AttachmentsModal({ vehicleId, recordType, recordId, title, onClose, onChanged }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const inputRef = useRef(null)

  const load = useCallback(() => { getAttachments(vehicleId, recordType, recordId).then(setItems) }, [vehicleId, recordType, recordId])
  useEffect(() => { load() }, [load])

  const handleFiles = async (fileList) => {
    setBusy(true); setError(null)
    try {
      for (const file of fileList) await uploadAttachment(vehicleId, recordType, recordId, file)
      load(); onChanged?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const del = async (id) => { await deleteAttachment(id); load(); onChanged?.() }

  return (
    <Modal title={title || 'Receipts & documents'} onClose={onClose}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
        className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer
                   hover:border-brand transition-colors"
      >
        <Upload size={20} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {busy ? 'Uploading…' : <>Drop files or <span className="text-brand font-medium">browse</span></>}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">Images or PDF · up to 25 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = '' }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">No files attached yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <button type="button" onClick={() => setView(a)} className="flex items-center gap-3 min-w-0 flex-1 group text-left">
                {isImage(a.filename) ? (
                  <img src={attachmentUrl(a.id)} alt="" className="w-10 h-10 rounded object-cover bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                )}
                <span className="text-sm truncate group-hover:text-brand">{a.filename}</span>
              </button>
              <button onClick={() => setToDelete(a)} className="text-slate-300 hover:text-red-500 p-1 flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {view && <Lightbox attachment={view} onClose={() => setView(null)} />}
      {toDelete && (
        <ConfirmDialog
          message={`Delete “${toDelete.filename}”?`}
          onConfirm={async () => { await del(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </Modal>
  )
}
