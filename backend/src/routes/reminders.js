import { Router } from 'express'
import { getDb } from '../db/index.js'
import { currentOdometer } from './vehicles.js'
import { recordItems } from './records.js'

const router = Router({ mergeParams: true })

// Add whole months to a YYYY-MM-DD date, returning YYYY-MM-DD.
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// Latest service/repair/upgrade record that includes the reminder's item.
// Records can now hold multiple items, so we match on membership, not equality.
function latestMatchingRecord(db, vehicleId, description) {
  const want = description?.trim().toLowerCase()
  if (!want) return null
  const rows = db.prepare(`
    SELECT date, odometer, items, description FROM (
      SELECT date, odometer, items, description FROM service_records WHERE vehicle_id = @v
      UNION ALL SELECT date, odometer, items, description FROM repair_records  WHERE vehicle_id = @v
      UNION ALL SELECT date, odometer, items, description FROM upgrade_records WHERE vehicle_id = @v
    ) WHERE date IS NOT NULL
  `).all({ v: vehicleId })
  const matches = rows.filter((r) => recordItems(r).some((i) => i.trim().toLowerCase() === want))
  matches.sort((a, b) => b.date.localeCompare(a.date) || (b.odometer ?? 0) - (a.odometer ?? 0))
  return matches[0] || null
}

// The "last done" event: the more recent (by date) of the manual baseline and
// the latest matching record. Returns { date, odometer } or null.
function lastDone(db, vehicleId, r) {
  const rec = latestMatchingRecord(db, vehicleId, r.description)
  const manual = (r.base_date || r.base_odometer != null)
    ? { date: r.base_date || null, odometer: r.base_odometer ?? null }
    : null
  const cands = [rec, manual].filter(Boolean)
  if (cands.length === 0) return null
  // Prefer the candidate with the later date; a dated candidate beats an undated one.
  return cands.reduce((best, c) => {
    if (!best) return c
    if (c.date && (!best.date || c.date > best.date)) return c
    return best
  }, null)
}

export function urgencyFromDue(due_date, due_odometer, odo) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const rank = { 'not-due': 0, upcoming: 1, 'due-soon': 2, overdue: 3 }
  let level = 'not-due'
  const bump = (l) => { if (rank[l] > rank[level]) level = l }

  if (due_date) {
    const days = Math.round((new Date(due_date + 'T00:00:00') - now) / 86400000)
    if (days < 0) bump('overdue')
    else if (days <= 14) bump('due-soon')
    else if (days <= 45) bump('upcoming')
  }
  if (due_odometer != null && odo != null) {
    const remaining = due_odometer - odo
    if (remaining < 0) bump('overdue')
    else if (remaining <= 500) bump('due-soon')
    else if (remaining <= 1500) bump('upcoming')
  }
  return level
}

// Compute the derived view of a reminder: last-done, next-due, and urgency.
function decorate(db, vehicleId, r, odo) {
  // One-time reminders carry their due point directly — nothing is derived.
  if (!r.is_recurring) {
    return {
      ...r,
      last_done_date: null,
      last_done_odometer: null,
      due_date: r.due_date || null,
      due_odometer: r.due_odometer ?? null,
      has_baseline: true,
      urgency: urgencyFromDue(r.due_date || null, r.due_odometer ?? null, odo),
    }
  }
  const anchor = lastDone(db, vehicleId, r)
  let due_date = null, due_odometer = null
  if (anchor) {
    if (r.interval_months && anchor.date) due_date = addMonths(anchor.date, r.interval_months)
    if (r.interval_miles && anchor.odometer != null) due_odometer = anchor.odometer + r.interval_miles
  }
  const urgency = anchor ? urgencyFromDue(due_date, due_odometer, odo) : 'not-due'
  return {
    ...r,
    last_done_date: anchor?.date ?? null,
    last_done_odometer: anchor?.odometer ?? null,
    due_date,
    due_odometer,
    has_baseline: !!anchor,
    urgency,
  }
}

// Decorated reminders for a vehicle, most pressing first. Shared with the dashboard.
export function decoratedReminders(db, vehicleId, odo = null) {
  const o = odo ?? currentOdometer(db, vehicleId)
  const rows = db.prepare('SELECT * FROM reminders WHERE vehicle_id = ?').all(vehicleId)
  const decorated = rows.map((r) => decorate(db, vehicleId, r, o))
  const rank = { overdue: 3, 'due-soon': 2, upcoming: 1, 'not-due': 0 }
  return decorated.sort((a, b) => rank[b.urgency] - rank[a.urgency])
}

// GET /api/vehicles/:vehicleId/reminders
router.get('/', (req, res) => {
  res.json(decoratedReminders(getDb(), req.params.vehicleId))
})

// POST /api/vehicles/:vehicleId/reminders
router.post('/', (req, res) => {
  const db = getDb()
  const {
    description, notes, interval_miles, interval_months, base_date, base_odometer,
    is_recurring = true, due_date, due_odometer,
  } = req.body
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' })
  if (is_recurring) {
    if (!interval_miles && !interval_months) {
      return res.status(400).json({ error: 'Set a mileage and/or time interval' })
    }
  } else if (!due_date && due_odometer == null) {
    return res.status(400).json({ error: 'Set a due date and/or odometer' })
  }
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO reminders (vehicle_id, description, notes, is_recurring,
                           interval_miles, interval_months, base_date, base_odometer,
                           due_date, due_odometer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.vehicleId, description.trim(), notes || null, is_recurring ? 1 : 0,
         is_recurring ? interval_miles ?? null : null,
         is_recurring ? interval_months ?? null : null,
         is_recurring ? base_date || null : null,
         is_recurring ? base_odometer ?? null : null,
         is_recurring ? null : due_date || null,
         is_recurring ? null : due_odometer ?? null)
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(lastInsertRowid)
  res.status(201).json(decorate(db, req.params.vehicleId, row, currentOdometer(db, req.params.vehicleId)))
})

// PATCH /api/vehicles/:vehicleId/reminders/:id
router.patch('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND vehicle_id = ?').get(req.params.id, req.params.vehicleId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const fields = ['description', 'notes', 'is_recurring', 'interval_miles', 'interval_months',
                  'base_date', 'base_odometer', 'due_date', 'due_odometer']
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const v = typeof req.body[f] === 'boolean' ? (req.body[f] ? 1 : 0) : req.body[f]
      db.prepare(`UPDATE reminders SET ${f} = ? WHERE id = ?`).run(v, row.id)
    }
  }
  const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(row.id)
  res.json(decorate(db, req.params.vehicleId, updated, currentOdometer(db, req.params.vehicleId)))
})

// DELETE /api/vehicles/:vehicleId/reminders/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const info = db.prepare('DELETE FROM reminders WHERE id = ? AND vehicle_id = ?').run(req.params.id, req.params.vehicleId)
  if (!info.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ deleted: true })
})

export default router
