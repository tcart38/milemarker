import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { mkdirSync, statSync, createReadStream, unlinkSync } from 'fs'
import { config } from '../config.js'
import { getDb } from '../db/index.js'

const router = Router()

const RECORD_TYPES = new Set(['fuel', 'service', 'repair', 'upgrade', 'vehicle'])

// Remove a record's attachment files + rows (attachments aren't FK-cascaded).
export function deleteAttachmentsFor(db, recordType, recordId) {
  const rows = db.prepare('SELECT * FROM attachments WHERE record_type = ? AND record_id = ?').all(recordType, recordId)
  for (const a of rows) { try { unlinkSync(a.filepath) } catch { /* already gone */ } }
  db.prepare('DELETE FROM attachments WHERE record_type = ? AND record_id = ?').run(recordType, recordId)
}

mkdirSync(config.uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } })

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.pdf': 'application/pdf',
}

// GET /api/attachments/:id/file — stream the file (inline)
router.get('/:id/file', (req, res) => {
  const db = getDb()
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  let stat
  try { stat = statSync(a.filepath) } catch { return res.status(404).json({ error: 'File missing on disk' }) }
  const ext = path.extname(a.filepath).toLowerCase()
  const safeName = a.filename.replace(/["\\\r\n]/g, '_')
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  res.setHeader('Content-Length', stat.size)
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
  createReadStream(a.filepath).pipe(res)
})

// GET /api/attachments/:vehicleId/:recordType/:recordId — list for a record
router.get('/:vehicleId/:recordType/:recordId', (req, res) => {
  const { recordType, recordId } = req.params
  if (!RECORD_TYPES.has(recordType)) return res.status(400).json({ error: 'Bad record type' })
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, filename, date_added FROM attachments WHERE record_type = ? AND record_id = ? ORDER BY id'
  ).all(recordType, recordId)
  res.json(rows)
})

// POST /api/attachments/:vehicleId/:recordType/:recordId — upload (field: file)
router.post('/:vehicleId/:recordType/:recordId', upload.single('file'), (req, res) => {
  const { recordType, recordId } = req.params
  if (!RECORD_TYPES.has(recordType)) return res.status(400).json({ error: 'Bad record type' })
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const db = getDb()
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO attachments (record_type, record_id, filename, filepath) VALUES (?, ?, ?, ?)'
  ).run(recordType, recordId, req.file.originalname, req.file.path)
  res.status(201).json(db.prepare('SELECT id, filename, date_added FROM attachments WHERE id = ?').get(lastInsertRowid))
})

// DELETE /api/attachments/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  try { unlinkSync(a.filepath) } catch { /* already gone */ }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id)
  res.json({ deleted: true })
})

export default router
