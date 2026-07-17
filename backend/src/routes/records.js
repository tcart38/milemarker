import { Router } from 'express'
import { getDb } from '../db/index.js'
import { deleteAttachmentsFor } from './attachments.js'
import { resolveServiceTypes, setRecordItems } from './service-types.js'

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

// Service items come from the type junction (canonical names, insert order).
function serviceItemsByRecord(db, vehicleId) {
  const rows = db.prepare(`
    SELECT i.record_id, t.name FROM service_record_items i
    JOIN service_types t ON t.id = i.type_id
    WHERE i.record_id IN (SELECT id FROM service_records WHERE vehicle_id = ?)
    ORDER BY i.rowid
  `).all(vehicleId)
  const byRecord = new Map()
  for (const r of rows) {
    if (!byRecord.has(r.record_id)) byRecord.set(r.record_id, [])
    byRecord.get(r.record_id).push(r.name)
  }
  return byRecord
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
  if (req.params.type === 'odometer') return res.json(rows)
  if (req.params.type !== 'service') return res.json(rows.map(shape))
  const byRecord = serviceItemsByRecord(db, req.params.vehicleId)
  res.json(rows.map((r) => {
    const items = byRecord.get(r.id) ?? recordItems(r)
    return { ...r, items, description: items.join(', ') }
  }))
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
  if (type === 'service') {
    // Names resolve to first-class types (creating any the user just invented).
    const resolved = resolveServiceTypes(db, items)
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO ${t} (vehicle_id, date, odometer, description, items, cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(req.params.vehicleId, date, odometer ?? null, resolved.names.join(', '), JSON.stringify(resolved.names), cost || 0, notes || null)
    setRecordItems(db, Number(lastInsertRowid), resolved.ids, resolved.names)
    return res.status(201).json(shape(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(lastInsertRowid)))
  }
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
    if (type === 'service') {
      const resolved = resolveServiceTypes(db, items)
      setRecordItems(db, row.id, resolved.ids, resolved.names)
    } else {
      db.prepare(`UPDATE ${t} SET items = ?, description = ? WHERE id = ?`).run(JSON.stringify(items), items.join(', '), row.id)
    }
  }
  res.json(shape(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(row.id)))
})

// POST /api/vehicles/:vehicleId/records/:type/:id/convert { to } — move a
// record between service/repair/upgrade. The row moves tables (new id),
// attachments follow, and service items resolve to/detach from types.
router.post('/:type/:id/convert', (req, res) => {
  const from = req.params.type
  const to = String(req.body.to || '')
  if (!ITEM_TYPES.has(from) || !ITEM_TYPES.has(to)) return res.status(400).json({ error: 'Invalid conversion' })
  if (from === to) return res.status(400).json({ error: 'Record is already that type' })
  const db = getDb()
  const row = db.prepare(`SELECT * FROM ${table(from)} WHERE id = ? AND vehicle_id = ?`).get(req.params.id, req.params.vehicleId)
  if (!row) return res.status(404).json({ error: 'Not found' })

  let newId
  db.transaction(() => {
    const items = recordItems(row)
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO ${table(to)} (vehicle_id, date, odometer, description, items, cost, notes, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.vehicle_id, row.date, row.odometer, items.join(', '), JSON.stringify(items), row.cost, row.notes, row.date_added)
    newId = Number(lastInsertRowid)
    if (to === 'service') {
      const resolved = resolveServiceTypes(db, items)
      setRecordItems(db, newId, resolved.ids, resolved.names)
    }
    db.prepare(`DELETE FROM ${table(from)} WHERE id = ?`).run(row.id) // service item links cascade
    db.prepare('UPDATE attachments SET record_type = ?, record_id = ? WHERE record_type = ? AND record_id = ?')
      .run(to, newId, from, row.id)
  })()
  res.json({ ...shape(db.prepare(`SELECT * FROM ${table(to)} WHERE id = ?`).get(newId)), type: to })
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
