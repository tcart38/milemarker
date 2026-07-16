import { Router } from 'express'
import { getDb } from '../db/index.js'
import { deleteAttachmentsFor } from './attachments.js'

const router = Router({ mergeParams: true })

// service / repair / upgrade share the full shape; odometer is a lean subset.
const TABLES = {
  service: 'service_records',
  repair: 'repair_records',
  upgrade: 'upgrade_records',
  odometer: 'odometer_records',
}
const ITEM_TYPES = new Set(['service', 'repair', 'upgrade'])

const table = (type) => TABLES[type]

// A record's line items: the JSON `items` array if present, else the single
// legacy description. Always returns a (possibly empty) array of strings.
export function recordItems(row) {
  if (row.items) { try { const a = JSON.parse(row.items); if (Array.isArray(a)) return a } catch { /* fall through */ } }
  return row.description ? [row.description] : []
}

// Normalize an incoming { items?, description? } into a clean string array.
function incomingItems(body) {
  let arr = []
  if (Array.isArray(body.items)) arr = body.items
  else if (typeof body.description === 'string') arr = body.description.split(',')
  return arr.map((s) => String(s).trim()).filter(Boolean)
}

function shape(row) {
  const items = recordItems(row)
  return { ...row, items, description: items.join(', ') }
}

// GET /api/vehicles/:vehicleId/records/:type
router.get('/:type', (req, res) => {
  const t = table(req.params.type)
  if (!t) return res.status(404).json({ error: 'Unknown record type' })
  const db = getDb()
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.record_type = ? AND a.record_id = r.id) AS attachment_count
    FROM ${t} r WHERE r.vehicle_id = ?
    ORDER BY r.date DESC, r.odometer DESC, r.id DESC
  `).all(req.params.type, req.params.vehicleId)
  res.json(req.params.type === 'odometer' ? rows : rows.map(shape))
})

// POST /api/vehicles/:vehicleId/records/:type
router.post('/:type', (req, res) => {
  const type = req.params.type
  const t = table(type)
  if (!t) return res.status(404).json({ error: 'Unknown record type' })
  const db = getDb()
  const { date, odometer, cost = 0, notes } = req.body
  if (!date) return res.status(400).json({ error: 'date is required' })

  if (type === 'odometer') {
    if (odometer == null) return res.status(400).json({ error: 'odometer is required' })
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO odometer_records (vehicle_id, date, odometer, notes) VALUES (?, ?, ?, ?)'
    ).run(req.params.vehicleId, date, odometer, notes || null)
    return res.status(201).json(db.prepare('SELECT * FROM odometer_records WHERE id = ?').get(lastInsertRowid))
  }

  const items = incomingItems(req.body)
  if (items.length === 0) return res.status(400).json({ error: 'Add at least one item' })
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO ${t} (vehicle_id, date, odometer, description, items, cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.vehicleId, date, odometer ?? null, items.join(', '), JSON.stringify(items), cost || 0, notes || null)
  res.status(201).json(shape(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(lastInsertRowid)))
})

// PATCH /api/vehicles/:vehicleId/records/:type/:id
router.patch('/:type/:id', (req, res) => {
  const type = req.params.type
  const t = table(type)
  if (!t) return res.status(404).json({ error: 'Unknown record type' })
  const db = getDb()
  const row = db.prepare(`SELECT * FROM ${t} WHERE id = ? AND vehicle_id = ?`).get(req.params.id, req.params.vehicleId)
  if (!row) return res.status(404).json({ error: 'Not found' })

  if (type === 'odometer') {
    for (const f of ['date', 'odometer', 'notes']) {
      if (req.body[f] !== undefined) db.prepare(`UPDATE odometer_records SET ${f} = ? WHERE id = ?`).run(req.body[f], row.id)
    }
    return res.json(db.prepare('SELECT * FROM odometer_records WHERE id = ?').get(row.id))
  }

  for (const f of ['date', 'odometer', 'cost', 'notes']) {
    if (req.body[f] !== undefined) db.prepare(`UPDATE ${t} SET ${f} = ? WHERE id = ?`).run(req.body[f], row.id)
  }
  if (ITEM_TYPES.has(type) && (req.body.items !== undefined || req.body.description !== undefined)) {
    const items = incomingItems(req.body)
    if (items.length === 0) return res.status(400).json({ error: 'Add at least one item' })
    db.prepare(`UPDATE ${t} SET items = ?, description = ? WHERE id = ?`).run(JSON.stringify(items), items.join(', '), row.id)
  }
  res.json(shape(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(row.id)))
})

// DELETE /api/vehicles/:vehicleId/records/:type/:id
router.delete('/:type/:id', (req, res) => {
  const t = table(req.params.type)
  if (!t) return res.status(404).json({ error: 'Unknown record type' })
  const db = getDb()
  const info = db.prepare(`DELETE FROM ${t} WHERE id = ? AND vehicle_id = ?`).run(req.params.id, req.params.vehicleId)
  if (!info.changes) return res.status(404).json({ error: 'Not found' })
  deleteAttachmentsFor(db, req.params.type, req.params.id)
  res.json({ deleted: true })
})

export default router
