import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, renameSync, existsSync } from 'fs'
import { config } from '../config.js'
import { getDb, closeDb, initDb } from '../db/index.js'
import { createZip, readZip } from '../lib/zip.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } })

// GET /api/backup/download — zip of the database plus every uploaded attachment.
router.get('/download', async (req, res) => {
  const db = getDb()
  const snapshot = path.join(config.dataDir, `.backup-snapshot-${Date.now()}.db`)
  try {
    await db.backup(snapshot) // consistent copy even mid-write (WAL-safe)
    const entries = [{ name: 'milemarker.db', data: readFileSync(snapshot) }]
    if (existsSync(config.uploadsDir)) {
      for (const f of readdirSync(config.uploadsDir)) {
        entries.push({ name: `uploads/${f}`, data: readFileSync(path.join(config.uploadsDir, f)) })
      }
    }
    const zip = createZip(entries)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="milemarker-backup-${new Date().toISOString().slice(0, 10)}.zip"`)
    res.send(zip)
  } catch (err) {
    res.status(500).json({ error: `Backup failed: ${err.message}` })
  } finally {
    try { rmSync(snapshot) } catch { /* not created */ }
  }
})

// POST /api/backup/restore — replace ALL data with the uploaded backup zip.
router.post('/restore', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' })

  let entries
  try { entries = readZip(req.file.buffer) }
  catch (err) { return res.status(400).json({ error: `Could not read backup: ${err.message}` }) }

  const dbEntry = entries.find((e) => e.name === 'milemarker.db')
  if (!dbEntry) return res.status(400).json({ error: 'Not a MileMarker backup — milemarker.db missing from the zip' })
  if (dbEntry.data.toString('latin1', 0, 15) !== 'SQLite format 3') {
    return res.status(400).json({ error: 'Backup database is not a valid SQLite file' })
  }

  // Stage the incoming files, close the live DB, swap, reopen. Keep the previous
  // database alongside as a one-level undo.
  const staged = path.join(config.dataDir, '.restore-staged.db')
  writeFileSync(staged, dbEntry.data)

  closeDb()
  try {
    for (const suffix of ['-wal', '-shm']) {
      try { rmSync(config.dbPath + suffix) } catch { /* absent */ }
    }
    if (existsSync(config.dbPath)) renameSync(config.dbPath, config.dbPath + '.pre-restore')
    renameSync(staged, config.dbPath)

    mkdirSync(config.uploadsDir, { recursive: true })
    for (const e of entries) {
      if (!e.name.startsWith('uploads/')) continue
      const base = path.basename(e.name) // never write outside the uploads dir
      if (!base) continue
      writeFileSync(path.join(config.uploadsDir, base), e.data)
    }
  } finally {
    initDb() // reopen (and re-migrate) whatever database is now in place
  }

  // The backup may come from an install with a different data dir — rebase
  // attachment paths onto this one.
  const db = getDb()
  for (const a of db.prepare('SELECT id, filepath FROM attachments').all()) {
    const rebased = path.join(config.uploadsDir, path.basename(a.filepath))
    if (rebased !== a.filepath) db.prepare('UPDATE attachments SET filepath = ? WHERE id = ?').run(rebased, a.id)
  }

  res.json({ restored: true, files: entries.length - 1 })
})

export default router
