import { Router } from 'express'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from '../db/index.js'
import { parseHostList } from '../hosts.js'

const router = Router()
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY/MM/DD']
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
  if (req.body.date_format !== undefined && !DATE_FORMATS.includes(req.body.date_format)) {
    return res.status(400).json({ error: `date_format must be one of ${DATE_FORMATS.join(', ')}` })
  }
  for (const k of allowed) {
    if (req.body[k] !== undefined) upsert.run(k, String(req.body[k]))
  }
  if (req.body.allowed_hosts !== undefined) {
    upsert.run('allowed_hosts', parseHostList(req.body.allowed_hosts).join(', '))
  }
  const rows = db.prepare('SELECT key, value FROM settings').all()
  res.json({ ...Object.fromEntries(rows.map((r) => [r.key, r.value])), version })
})

export default router
