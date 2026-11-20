import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { runMigrations } from '../src/db/schema.js'
import { tireStats } from '../src/routes/tires.js'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const vehicleId = Number(db.prepare("INSERT INTO vehicles (name) VALUES ('Test car')").run().lastInsertRowid)
  const addSet = (name) => Number(db.prepare('INSERT INTO tire_sets (vehicle_id, name) VALUES (?, ?)').run(vehicleId, name).lastInsertRowid)
  const swap = (setId, date, odometer) =>
    db.prepare('INSERT INTO tire_changes (vehicle_id, set_id, date, odometer) VALUES (?, ?, ?, ?)').run(vehicleId, setId, date, odometer)
  return { db, vehicleId, addSet, swap }
}

test('an unmounted set is off since the swap that took it off, not the one that put it on', () => {
  const { db, vehicleId, addSet, swap } = setup()
  const summer = addSet('Summer')
  const winter = addSet('Winter')
  swap(summer, '2025-04-01', 10000)
  swap(winter, '2025-12-01', 15000) // winter tires go on
  swap(summer, '2026-04-15', 19000) // and come off when summers go back on

  const { sets } = tireStats(db, vehicleId)
  const w = sets.find((s) => s.id === winter)
  const s = sets.find((s) => s.id === summer)

  assert.equal(w.is_mounted, false)
  assert.equal(w.last_change.date, '2025-12-01')
  assert.equal(w.unmounted_since.date, '2026-04-15')
  assert.equal(w.unmounted_since.odometer, 19000)

  assert.equal(s.is_mounted, true)
  assert.equal(s.mounted_since.date, '2026-04-15')
  assert.equal(s.unmounted_since, null)
})

test('a set that was never mounted has no off date', () => {
  const { db, vehicleId, addSet, swap } = setup()
  const summer = addSet('Summer')
  const spare = addSet('Spare')
  swap(summer, '2026-01-01', 1000)

  const sp = tireStats(db, vehicleId).sets.find((s) => s.id === spare)
  assert.equal(sp.last_change, null)
  assert.equal(sp.unmounted_since, null)
})
