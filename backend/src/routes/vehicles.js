import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

// Highest odometer seen across every record type for a vehicle.
export function currentOdometer(db, vehicleId) {
  const row = db.prepare(`
    SELECT MAX(odo) AS odo FROM (
      SELECT MAX(odometer) AS odo FROM fuel_records WHERE vehicle_id = @id
      UNION ALL SELECT MAX(odometer) FROM service_records WHERE vehicle_id = @id
      UNION ALL SELECT MAX(odometer) FROM repair_records WHERE vehicle_id = @id
      UNION ALL SELECT MAX(odometer) FROM upgrade_records WHERE vehicle_id = @id
      UNION ALL SELECT MAX(odometer) FROM odometer_records WHERE vehicle_id = @id
    )
  `).get({ id: vehicleId })
  return row?.odo ?? null
}

// Lowest odometer seen across every record type — where tracking began.
export function firstOdometer(db, vehicleId) {
  const row = db.prepare(`
    SELECT MIN(odo) AS odo FROM (
      SELECT MIN(odometer) AS odo FROM fuel_records WHERE vehicle_id = @id
      UNION ALL SELECT MIN(odometer) FROM service_records WHERE vehicle_id = @id
      UNION ALL SELECT MIN(odometer) FROM repair_records WHERE vehicle_id = @id
      UNION ALL SELECT MIN(odometer) FROM upgrade_records WHERE vehicle_id = @id
      UNION ALL SELECT MIN(odometer) FROM odometer_records WHERE vehicle_id = @id
    )
  `).get({ id: vehicleId })
  return row?.odo ?? null
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic)$/i

function withStats(db, v) {
  const spend = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(cost),0) FROM fuel_records    WHERE vehicle_id = @id) +
      (SELECT COALESCE(SUM(cost),0) FROM service_records WHERE vehicle_id = @id) +
      (SELECT COALESCE(SUM(cost),0) FROM repair_records  WHERE vehicle_id = @id) +
      (SELECT COALESCE(SUM(cost),0) FROM upgrade_records WHERE vehicle_id = @id) AS total
  `).get({ id: v.id })
  // First image attached at the vehicle level doubles as the vehicle's photo.
  const photo = db.prepare(
    "SELECT id, filename FROM attachments WHERE record_type = 'vehicle' AND record_id = ? ORDER BY id"
  ).all(v.id).find((a) => IMAGE_EXT.test(a.filename))
  return { ...v, odometer: currentOdometer(db, v.id), total_cost: spend.total, photo_attachment_id: photo?.id ?? null }
}

// GET /api/vehicles — active only by default; ?all=1 includes sold/archived
router.get('/', (req, res) => {
  const db = getDb()
  const where = req.query.all ? '' : 'WHERE is_archived = 0'
  const rows = db.prepare(`SELECT * FROM vehicles ${where} ORDER BY is_archived, sort_order, id`).all()
  res.json(rows.map((v) => withStats(db, v)))
})

// GET /api/vehicles/:id
router.get('/:id', (req, res) => {
  const db = getDb()
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Not found' })
  res.json(withStats(db, v))
})

// POST /api/vehicles
router.post('/', (req, res) => {
  const db = getDb()
  const { name, year, make, model, license_plate, purchase_date, notes, is_electric } = req.body
  if (!make && !model && !name) {
    return res.status(400).json({ error: 'A make/model or name is required' })
  }
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO vehicles (name, year, make, model, license_plate, purchase_date, notes, is_electric)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name || null, year || null, make || null, model || null, license_plate || null, purchase_date || null, notes || null, is_electric ? 1 : 0)
  res.status(201).json(withStats(db, db.prepare('SELECT * FROM vehicles WHERE id = ?').get(lastInsertRowid)))
})

// PATCH /api/vehicles/:id
router.patch('/:id', (req, res) => {
  const db = getDb()
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Not found' })
  const fields = ['name', 'year', 'make', 'model', 'license_plate', 'purchase_date', 'notes', 'is_archived', 'sort_order',
                  'sold_date', 'purchase_price', 'sold_price', 'is_electric']
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = typeof req.body[f] === 'boolean' ? (req.body[f] ? 1 : 0) : req.body[f]
      db.prepare(`UPDATE vehicles SET ${f} = ? WHERE id = ?`).run(val, v.id)
    }
  }
  res.json(withStats(db, db.prepare('SELECT * FROM vehicles WHERE id = ?').get(v.id)))
})

// DELETE /api/vehicles/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(v.id)
  res.json({ deleted: true })
})

export default router
