import { Router } from 'express'
import { getDb } from '../db/index.js'
import { deleteAttachmentsFor } from './attachments.js'

const router = Router({ mergeParams: true })

// Walk fuel records in odometer order and return the valid fill-to-full
// segments: distance and quantity since the previous fill-to-full, keyed by the
// record that closes the segment. A "missed previous fill-up" flag anywhere in
// a segment (including on the closing record) means unlogged fuel, so that
// segment's distance/quantity ratio is meaningless and it is dropped.
export function fuelSegments(rows) {
  const asc = [...rows].sort((a, b) => a.odometer - b.odometer || a.id - b.id)
  const segments = []
  let lastFullOdo = null
  let qtySinceFull = 0
  let sawMissed = false
  for (const r of asc) {
    qtySinceFull += r.quantity
    if (r.missed_fuelup) sawMissed = true
    if (r.is_fill_to_full) {
      if (lastFullOdo !== null && !sawMissed && qtySinceFull > 0) {
        const dist = r.odometer - lastFullOdo
        if (dist > 0) segments.push({ id: r.id, dist, qty: qtySinceFull })
      }
      lastFullOdo = r.odometer
      qtySinceFull = 0
      sawMissed = false
    }
  }
  return segments
}

// Compute per-record fuel economy (distance / quantity) for the list.
function attachEconomy(rows) {
  const mpgById = {}
  for (const s of fuelSegments(rows)) mpgById[s.id] = +(s.dist / s.qty).toFixed(2)
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
