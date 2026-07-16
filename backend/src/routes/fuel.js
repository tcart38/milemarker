import { Router } from 'express'
import { getDb } from '../db/index.js'
import { deleteAttachmentsFor } from './attachments.js'

const router = Router({ mergeParams: true })

// Compute per-record fuel economy (distance / quantity) for the list.
// Distance for a fill-to-full record is measured from the previous fill-to-full
// odometer; a "missed fuel-up" in between makes the following record's economy
// unreliable, so we skip economy for the record right after a missed one.
function attachEconomy(rows) {
  const asc = [...rows].sort((a, b) => a.odometer - b.odometer || a.id - b.id)
  let lastFullOdo = null
  let qtySinceFull = 0
  let sawMissed = false
  const mpgById = {}
  for (const r of asc) {
    qtySinceFull += r.quantity
    if (r.is_fill_to_full) {
      if (lastFullOdo !== null && !sawMissed && qtySinceFull > 0) {
        const dist = r.odometer - lastFullOdo
        if (dist > 0) mpgById[r.id] = +(dist / qtySinceFull).toFixed(2)
      }
      lastFullOdo = r.odometer
      qtySinceFull = 0
      sawMissed = false
    }
    if (r.missed_fuelup) sawMissed = true
  }
  return rows.map((r) => ({ ...r, economy: mpgById[r.id] ?? null }))
}

// GET /api/vehicles/:vehicleId/fuel
router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.record_type = 'fuel' AND a.record_id = f.id) AS attachment_count
    FROM fuel_records f WHERE f.vehicle_id = ?
    ORDER BY f.date DESC, f.odometer DESC, f.id DESC
  `).all(req.params.vehicleId)
  res.json(attachEconomy(rows))
})

// POST /api/vehicles/:vehicleId/fuel
router.post('/', (req, res) => {
  const db = getDb()
  const { date, odometer, quantity, cost, is_fill_to_full = 1, missed_fuelup = 0, notes } = req.body
  if (!date || odometer == null || quantity == null || cost == null) {
    return res.status(400).json({ error: 'date, odometer, quantity, and cost are required' })
  }
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO fuel_records (vehicle_id, date, odometer, quantity, cost, is_fill_to_full, missed_fuelup, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.vehicleId, date, odometer, quantity, cost, is_fill_to_full ? 1 : 0, missed_fuelup ? 1 : 0, notes || null)
  res.status(201).json(db.prepare('SELECT * FROM fuel_records WHERE id = ?').get(lastInsertRowid))
})

// PATCH /api/vehicles/:vehicleId/fuel/:id
router.patch('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fuel_records WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const fields = ['date', 'odometer', 'quantity', 'cost', 'is_fill_to_full', 'missed_fuelup', 'notes']
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = (f === 'is_fill_to_full' || f === 'missed_fuelup') ? (req.body[f] ? 1 : 0) : req.body[f]
      db.prepare(`UPDATE fuel_records SET ${f} = ? WHERE id = ?`).run(val, row.id)
    }
  }
  res.json(db.prepare('SELECT * FROM fuel_records WHERE id = ?').get(row.id))
})

// DELETE /api/vehicles/:vehicleId/fuel/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const info = db.prepare('DELETE FROM fuel_records WHERE id = ? AND vehicle_id = ?').run(req.params.id, req.params.vehicleId)
  if (!info.changes) return res.status(404).json({ error: 'Not found' })
  deleteAttachmentsFor(db, 'fuel', req.params.id)
  res.json({ deleted: true })
})

export default router
