import { Router } from 'express'
import { getDb } from '../db/index.js'
import { currentOdometer } from './vehicles.js'
import { recordItems } from './records.js'

const router = Router({ mergeParams: true })

const RECORD_TABLES = { service: 'service_records', repair: 'repair_records', upgrade: 'upgrade_records' }

// A record counts as a rotation if any of its line items says so. Loose on
// purpose: "Tire rotation", "Rotate tires" and "rotation + balance" all match.
const ROTATION = /rotat/i

const SET_FIELDS = ['name', 'size', 'purchase_date', 'cost', 'expected_miles', 'rotate_miles', 'baseline_miles', 'notes', 'is_retired']
const CHANGE_FIELDS = ['set_id', 'date', 'odometer', 'notes']

const num = (v) => (v === '' || v == null ? null : Number(v))

// Every record across the three cost tables that names a tire set.
function tireRecords(db, vehicleId) {
  const rows = []
  for (const [type, table] of Object.entries(RECORD_TABLES)) {
    for (const r of db.prepare(`SELECT * FROM ${table} WHERE vehicle_id = ? AND tire_set_id IS NOT NULL`).all(vehicleId)) {
      const items = recordItems(r)
      rows.push({
        id: r.id, type, tire_set_id: r.tire_set_id, date: r.date, odometer: r.odometer,
        cost: r.cost, notes: r.notes, items, description: items.join(', '),
        is_rotation: items.some((i) => ROTATION.test(i)),
      })
    }
  }
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.odometer ?? -1) - (a.odometer ?? -1))
}

// The whole picture for one vehicle: each set with its derived mileage, plus
// the changeover timeline that produced it.
//
// Mileage is never stored. The changes are a partition of the odometer line —
// each one runs until the next, and the newest runs to the vehicle's current
// reading — so every set's total is the sum of the stints it was mounted for.
// Correcting a swap you logged late reshuffles the totals automatically.
export function tireStats(db, vehicleId) {
  const sets = db.prepare('SELECT * FROM tire_sets WHERE vehicle_id = ? ORDER BY id').all(vehicleId)
  const changes = db.prepare(`
    SELECT * FROM tire_changes WHERE vehicle_id = ? ORDER BY odometer, date, id
  `).all(vehicleId)
  const odometer = currentOdometer(db, vehicleId)
  const records = tireRecords(db, vehicleId)
  const treads = sets.length
    ? db.prepare(`
        SELECT * FROM tire_treads WHERE set_id IN (${sets.map(() => '?').join(',')})
        ORDER BY date DESC, id DESC
      `).all(...sets.map((s) => s.id))
    : []

  // Walk the timeline once, crediting each stint to the set that was on the car.
  const miles = new Map(sets.map((s) => [s.id, 0]))
  const stints = changes.map((c, i) => {
    const next = changes[i + 1]
    const end = next ? next.odometer : odometer
    const dist = end != null ? Math.max(0, end - c.odometer) : null
    if (c.set_id != null && dist != null) miles.set(c.set_id, (miles.get(c.set_id) ?? 0) + dist)
    // Naming the set that was already on isn't a swap — it just splits one
    // stint in two. Usually a duplicate the user will want to remove.
    const redundant = i > 0 && changes[i - 1].set_id === c.set_id
    return { ...c, miles: dist, is_current: !next, is_redundant: redundant }
  })

  const mounted = changes.length ? changes[changes.length - 1].set_id : null
  const setName = new Map(sets.map((s) => [s.id, s.name]))

  const decorated = sets.map((s) => {
    const own = stints.filter((c) => c.set_id === s.id)
    const mine = records.filter((r) => r.tire_set_id === s.id)
    const lastRotation = mine.filter((r) => r.is_rotation)[0] ?? null
    // Miles measured from the changeovers, plus whatever the set had already
    // done when tracking started (an estimate for tires bought before then).
    const tracked = miles.get(s.id) ?? 0
    const total = tracked + (s.baseline_miles ?? 0)
    // Miles since the last rotation only count while this set was on the car —
    // a set sitting in the garage isn't wearing unevenly.
    const sinceRotation = lastRotation?.odometer != null
      ? own.reduce((sum, c) => {
          const from = Math.max(c.odometer, lastRotation.odometer)
          const to = c.miles != null ? c.odometer + c.miles : c.odometer
          return sum + Math.max(0, to - from)
        }, 0)
      : null
    return {
      ...s,
      miles: total,
      tracked_miles: tracked,
      is_mounted: s.id === mounted,
      mounted_since: s.id === mounted ? own[own.length - 1] ?? null : null,
      last_change: own[own.length - 1] ?? null,
      wear_pct: s.expected_miles > 0 ? Math.min(1, total / s.expected_miles) : null,
      cost_per_1000: s.cost != null && total > 0 ? +((s.cost / total) * 1000).toFixed(2) : null,
      last_rotation: lastRotation && { date: lastRotation.date, odometer: lastRotation.odometer, miles_ago: sinceRotation },
      miles_since_rotation: sinceRotation,
      treads: treads.filter((t) => t.set_id === s.id),
      records: mine,
    }
  })

  return {
    odometer,
    mounted_set_id: mounted,
    sets: decorated,
    changes: [...stints].reverse().map((c) => ({ ...c, set_name: c.set_id != null ? setName.get(c.set_id) ?? null : null })),
  }
}

// GET /api/vehicles/:vehicleId/tires
router.get('/', (req, res) => {
  res.json(tireStats(getDb(), req.params.vehicleId))
})

// POST /api/vehicles/:vehicleId/tires/sets { name, ... , mount_odometer?, mount_date? }
// Mounting on create is how "I just installed these" is logged in one step.
router.post('/sets', (req, res) => {
  const db = getDb()
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Give the set a name' })

  let setId
  db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO tire_sets (vehicle_id, name, size, purchase_date, cost, expected_miles, rotate_miles, baseline_miles, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.vehicleId, name, req.body.size || null, req.body.purchase_date || null,
      num(req.body.cost), num(req.body.expected_miles), num(req.body.rotate_miles),
      num(req.body.baseline_miles), req.body.notes || null
    )
    setId = Number(lastInsertRowid)
    if (req.body.mount_odometer != null) {
      db.prepare('INSERT INTO tire_changes (vehicle_id, set_id, date, odometer, notes) VALUES (?, ?, ?, ?, ?)')
        .run(req.params.vehicleId, setId, req.body.mount_date || new Date().toISOString().slice(0, 10),
             num(req.body.mount_odometer), null)
    }
  })()
  res.status(201).json({ id: setId, ...tireStats(db, req.params.vehicleId) })
})

// PATCH /api/vehicles/:vehicleId/tires/sets/:id
router.patch('/sets/:id', (req, res) => {
  const db = getDb()
  const set = db.prepare('SELECT * FROM tire_sets WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!set) return res.status(404).json({ error: 'Not found' })
  for (const f of SET_FIELDS) {
    if (req.body[f] === undefined) continue
    let val = req.body[f]
    if (f === 'name') {
      val = String(val || '').trim()
      if (!val) return res.status(400).json({ error: 'Give the set a name' })
    } else if (f === 'is_retired') val = val ? 1 : 0
    else if (['cost', 'expected_miles', 'rotate_miles', 'baseline_miles'].includes(f)) val = num(val)
    else val = val || null
    db.prepare(`UPDATE tire_sets SET ${f} = ? WHERE id = ?`).run(val, set.id)
  }
  res.json(tireStats(db, req.params.vehicleId))
})

// DELETE /api/vehicles/:vehicleId/tires/sets/:id — takes its changeovers and
// tread readings with it; records that referenced it just lose the tag.
router.delete('/sets/:id', (req, res) => {
  const db = getDb()
  const set = db.prepare('SELECT * FROM tire_sets WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!set) return res.status(404).json({ error: 'Not found' })
  db.transaction(() => {
    for (const table of Object.values(RECORD_TABLES)) {
      db.prepare(`UPDATE ${table} SET tire_set_id = NULL WHERE tire_set_id = ?`).run(set.id)
    }
    db.prepare('DELETE FROM tire_sets WHERE id = ?').run(set.id) // changes + treads cascade
  })()
  res.json({ deleted: true, ...tireStats(db, req.params.vehicleId) })
})

// POST /api/vehicles/:vehicleId/tires/changes { set_id|null, date, odometer }
router.post('/changes', (req, res) => {
  const db = getDb()
  const { date, odometer } = req.body
  if (!date) return res.status(400).json({ error: 'date is required' })
  if (odometer == null || odometer === '') return res.status(400).json({ error: 'An odometer reading is required — it is what the mileage is measured from' })
  const setId = num(req.body.set_id)
  if (setId != null && !db.prepare('SELECT 1 FROM tire_sets WHERE id = ? AND vehicle_id = ?').get(setId, req.params.vehicleId)) {
    return res.status(400).json({ error: 'Unknown tire set' })
  }
  db.prepare('INSERT INTO tire_changes (vehicle_id, set_id, date, odometer, notes) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.vehicleId, setId, date, num(odometer), req.body.notes || null)
  res.status(201).json(tireStats(db, req.params.vehicleId))
})

// PATCH /api/vehicles/:vehicleId/tires/changes/:id
router.patch('/changes/:id', (req, res) => {
  const db = getDb()
  const change = db.prepare('SELECT * FROM tire_changes WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!change) return res.status(404).json({ error: 'Not found' })
  const newSetId = num(req.body.set_id)
  if (req.body.set_id !== undefined && newSetId != null &&
      !db.prepare('SELECT 1 FROM tire_sets WHERE id = ? AND vehicle_id = ?').get(newSetId, req.params.vehicleId)) {
    return res.status(400).json({ error: 'Unknown tire set' })
  }
  for (const f of CHANGE_FIELDS) {
    if (req.body[f] === undefined) continue
    const val = f === 'notes' ? (req.body[f] || null) : f === 'date' ? req.body[f] : num(req.body[f])
    if (f === 'odometer' && val == null) return res.status(400).json({ error: 'An odometer reading is required' })
    db.prepare(`UPDATE tire_changes SET ${f} = ? WHERE id = ?`).run(val, change.id)
  }
  res.json(tireStats(db, req.params.vehicleId))
})

// DELETE /api/vehicles/:vehicleId/tires/changes/:id
router.delete('/changes/:id', (req, res) => {
  const db = getDb()
  const info = db.prepare('DELETE FROM tire_changes WHERE id = ? AND vehicle_id = ?').run(req.params.id, req.params.vehicleId)
  if (!info.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ deleted: true, ...tireStats(db, req.params.vehicleId) })
})

// POST /api/vehicles/:vehicleId/tires/sets/:id/treads { date, lf, rf, lr, rr }
router.post('/sets/:id/treads', (req, res) => {
  const db = getDb()
  const set = db.prepare('SELECT * FROM tire_sets WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!set) return res.status(404).json({ error: 'Not found' })
  const corners = ['lf', 'rf', 'lr', 'rr'].map((c) => num(req.body[c]))
  if (corners.every((v) => v == null)) return res.status(400).json({ error: 'Enter at least one tread depth' })
  db.prepare('INSERT INTO tire_treads (set_id, date, odometer, lf, rf, lr, rr, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(set.id, req.body.date || new Date().toISOString().slice(0, 10), num(req.body.odometer), ...corners, req.body.notes || null)
  res.status(201).json(tireStats(db, req.params.vehicleId))
})

// DELETE /api/vehicles/:vehicleId/tires/treads/:id
router.delete('/treads/:id', (req, res) => {
  const db = getDb()
  const info = db.prepare(`
    DELETE FROM tire_treads WHERE id = ?
      AND set_id IN (SELECT id FROM tire_sets WHERE vehicle_id = ?)
  `).run(req.params.id, req.params.vehicleId)
  if (!info.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ deleted: true, ...tireStats(db, req.params.vehicleId) })
})

export default router
