import { Router } from 'express'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from '../db/index.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'))

// GET /api/settings
router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  res.json({ ...settings, version })
})

// PUT /api/settings
router.put('/', (req, res) => {
  const db = getDb()
  const allowed = ['distance_unit', 'volume_unit', 'currency_symbol', 'date_format']
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const k of allowed) {
    if (req.body[k] !== undefined) upsert.run(k, String(req.body[k]))
  }
  const rows = db.prepare('SELECT key, value FROM settings').all()
  res.json({ ...Object.fromEntries(rows.map((r) => [r.key, r.value])), version })
})

export default router
