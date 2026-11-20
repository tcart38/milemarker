import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Paperclip, FileText, Trash2 } from 'lucide-react'
import { getAttachments, deleteAttachment, attachmentUrl } from '../api/client.js'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemActions } from '@/components/ui/item'
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
    <Button type="button" variant="ghost" size="icon" aria-label={`View ${name}`} onClick={onClick} className="size-9 rounded bg-muted overflow-hidden p-0">
      {isImage(name) && url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <FileText className="text-muted-foreground" />}
    </Button>
  )

  const DeleteBtn = ({ label, onClick }) => (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}`} onClick={onClick} className="text-muted-foreground hover:text-destructive" />}
      >
        <Trash2 />
      </TooltipTrigger>
      <TooltipContent>{label.split(' ')[0]}</TooltipContent>
    </Tooltip>
  )

  return (
    <div>
      <Label className="mb-1.5">Receipts & documents</Label>
      <ItemGroup className="gap-1.5">
        {existing.map((a) => (
          <Item key={`e${a.id}`} size="xs" className="p-0">
            <ItemMedia><Thumb name={a.filename} url={attachmentUrl(a.id)} onClick={() => setView({ attachment: a })} /></ItemMedia>
            <ItemContent><ItemTitle className="max-w-full truncate">{a.filename}</ItemTitle></ItemContent>
            <ItemActions><DeleteBtn label={`Delete ${a.filename}`} onClick={() => setToDelete(a)} /></ItemActions>
          </Item>
        ))}
        {pending.map((f, i) => (
          <Item key={`p${i}`} size="xs" className="p-0">
            <ItemMedia><Thumb name={f.name} url={previews[i]} onClick={() => setView({ attachment: { filename: f.name }, src: previews[i] })} /></ItemMedia>
            <ItemContent><ItemTitle className="max-w-full truncate">{f.name} <span className="text-xs font-normal text-muted-foreground">· pending</span></ItemTitle></ItemContent>
            <ItemActions><DeleteBtn label={`Remove ${f.name}`} onClick={() => removePending(i)} /></ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <Button
        type="button" variant="outline"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-1.5 w-full border-dashed text-xs ${dragging ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:text-primary'}`}
      >
        <Paperclip /> {dragging ? 'Drop to attach' : <>Drop files or <span className="font-medium">attach receipt</span></>}
      </Button>
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
