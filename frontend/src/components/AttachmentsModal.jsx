import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, FileText, Trash2 } from 'lucide-react'
import { getAttachments, uploadAttachment, deleteAttachment, attachmentUrl } from '../api/client.js'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemActions } from '@/components/ui/item'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
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
        className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer
 hover:border-primary transition-colors"
      >
        <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {busy ? <span className="inline-flex items-center gap-1.5"><Spinner /> Uploading…</span> : <>Drop files or <span className="text-primary font-medium">browse</span></>}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Images or PDF · up to 25 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = '' }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}

      {items.length === 0 ? (
        <Empty className="p-2">
          <EmptyHeader><EmptyTitle className="text-sm font-normal text-muted-foreground">No files attached yet.</EmptyTitle></EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {items.map((a) => (
            <Item key={a.id} size="xs" className="p-0 flex-nowrap">
              <Button type="button" variant="ghost" onClick={() => setView(a)} className="h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left hover:bg-transparent">
                <ItemMedia variant="image">
                  {isImage(a.filename) ? (
                    <img src={attachmentUrl(a.id)} alt="" loading="lazy" className="bg-muted" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-muted"><FileText className="size-4 text-muted-foreground" /></div>
                  )}
                </ItemMedia>
                <span className="truncate text-sm font-normal">{a.filename}</span>
              </Button>
              <ItemActions>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${a.filename}`} onClick={() => setToDelete(a)} className="text-muted-foreground hover:text-destructive" />}
                  >
                    <Trash2 />
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
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
