import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

// Resolve item names to types: alias lookup first, then name (both NOCASE),
// else create — flagged needs_review when the name arrived via an import.
// Returns deduped { ids, names } with canonical spellings, preserving order.
export function resolveServiceTypes(db, rawNames, { fromImport = false } = {}) {
  const findAlias = db.prepare('SELECT type_id FROM service_type_aliases WHERE alias = ?')
  const findType = db.prepare('SELECT id, name FROM service_types WHERE name = ?')
  const byId = db.prepare('SELECT id, name FROM service_types WHERE id = ?')
  const insert = db.prepare('INSERT INTO service_types (name, needs_review) VALUES (?, ?)')
  const ids = []
  const names = []
  for (const raw of rawNames) {
    const name = String(raw).trim()
    if (!name) continue
    const alias = findAlias.get(name)
    let row = alias ? byId.get(alias.type_id) : findType.get(name)
    if (!row) row = { id: Number(insert.run(name, fromImport ? 1 : 0).lastInsertRowid), name }
    if (!ids.includes(row.id)) { ids.push(row.id); names.push(row.name) }
  }
  return { ids, names }
}

// Point a service record at these types and keep its denormalized summary
// (description + legacy items JSON) in sync.
export function setRecordItems(db, recordId, typeIds, names) {
  db.prepare('DELETE FROM service_record_items WHERE record_id = ?').run(recordId)
  const link = db.prepare('INSERT INTO service_record_items (record_id, type_id) VALUES (?, ?)')
  for (const id of typeIds) link.run(recordId, id)
  db.prepare('UPDATE service_records SET description = ?, items = ? WHERE id = ?')
    .run(names.join(', '), JSON.stringify(names), recordId)
}

// Rewrite the denormalized summaries of every record using a type (after a
// rename or merge). Returns how many records were touched.
function syncRecordsUsing(db, typeId) {
  const recordIds = db.prepare('SELECT DISTINCT record_id FROM service_record_items WHERE type_id = ?').all(typeId)
  const namesFor = db.prepare(`
    SELECT t.name FROM service_record_items i JOIN service_types t ON t.id = i.type_id
    WHERE i.record_id = ? ORDER BY i.rowid
  `)
  const update = db.prepare('UPDATE service_records SET description = ?, items = ? WHERE id = ?')
  for (const { record_id } of recordIds) {
    const names = namesFor.all(record_id).map((r) => r.name)
    update.run(names.join(', '), JSON.stringify(names), record_id)
  }
  return recordIds.length
}

const typeWithCounts = `
  SELECT t.id, t.name, t.is_builtin, t.needs_review,
    (SELECT COUNT(DISTINCT record_id) FROM service_record_items i WHERE i.type_id = t.id) AS record_count,
    (SELECT COUNT(*) FROM reminders r WHERE r.type_id = t.id) AS reminder_count
  FROM service_types t
`

// Recent rename/merge snapshots for one-click undo. In-memory is fine for a
// single-user app: undo is offered right after the action, single-use.
const undoOps = new Map()
let undoSeq = 0
function rememberUndo(payload) {
  const id = String(++undoSeq)
  undoOps.set(id, payload)
  if (undoOps.size > 20) undoOps.delete(undoOps.keys().next().value)
  return id
}

// GET /api/service-types — every type with usage counts and remembered aliases.
router.get('/', (req, res) => {
  const db = getDb()
  const types = db.prepare(`${typeWithCounts} ORDER BY t.name COLLATE NOCASE`).all()
  const aliasesByType = new Map()
  for (const a of db.prepare('SELECT alias, type_id FROM service_type_aliases').all()) {
    if (!aliasesByType.has(a.type_id)) aliasesByType.set(a.type_id, [])
    aliasesByType.get(a.type_id).push(a.alias)
  }
  res.json(types.map((t) => ({ ...t, aliases: aliasesByType.get(t.id) || [] })))
})

// POST /api/service-types { name } — create a reviewed type. An explicit
// create overrides a remembered alias of the same spelling.
router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  const db = getDb()
  const existing = db.prepare('SELECT id, name FROM service_types WHERE name = ?').get(name)
  if (existing) return res.status(409).json({ error: `“${existing.name}” already exists` })
  db.prepare('DELETE FROM service_type_aliases WHERE alias = ?').run(name)
  const { lastInsertRowid } = db.prepare('INSERT INTO service_types (name, needs_review) VALUES (?, 0)').run(name)
  res.status(201).json(db.prepare(`${typeWithCounts} WHERE t.id = ?`).get(lastInsertRowid))
})

// PATCH /api/service-types/:id { name?, needs_review? } — rename updates the
// one row, then re-syncs record summaries and linked reminder descriptions.
// Renaming to another existing type's name is a 409: that's a merge.
router.patch('/:id', (req, res) => {
  const db = getDb()
  const type = db.prepare('SELECT * FROM service_types WHERE id = ?').get(req.params.id)
  if (!type) return res.status(404).json({ error: 'Not found' })

  let records = 0
  let reminders = 0
  let undoId = null
  const result = db.transaction(() => {
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim()
      if (!name) return { status: 400, body: { error: 'name cannot be empty' } }
      const clash = db.prepare('SELECT id, name FROM service_types WHERE name = ? AND id != ?').get(name, type.id)
      if (clash) return { status: 409, body: { error: `“${clash.name}” already exists — merge into it instead`, merge_into: clash.id } }
      db.prepare('UPDATE service_types SET name = ?, needs_review = 0 WHERE id = ?').run(name, type.id)
      // An alias equal to the type's own name is redundant (name wins on
      // resolve) — clearing it also makes undoing a rename clean.
      db.prepare('DELETE FROM service_type_aliases WHERE alias = ? AND type_id = ?').run(name, type.id)
      // Remember the old spelling so future imports of it map here (optional).
      const remember = req.body.remember !== false
      let aliasAdded = false
      if (remember && name.toLowerCase() !== type.name.toLowerCase()) {
        aliasAdded = db.prepare('INSERT OR IGNORE INTO service_type_aliases (alias, type_id) VALUES (?, ?)')
          .run(type.name, type.id).changes > 0
      }
      records = syncRecordsUsing(db, type.id)
      reminders = db.prepare('UPDATE reminders SET description = ? WHERE type_id = ?').run(name, type.id).changes
      undoId = rememberUndo({
        op: 'rename', type_id: type.id, old_name: type.name,
        old_needs_review: type.needs_review, alias_added: aliasAdded,
      })
    }
    if (req.body.needs_review !== undefined) {
      db.prepare('UPDATE service_types SET needs_review = ? WHERE id = ?').run(req.body.needs_review ? 1 : 0, type.id)
    }
    return null
  })()
  if (result) return res.status(result.status).json(result.body)
  res.json({ ...db.prepare(`${typeWithCounts} WHERE t.id = ?`).get(type.id), records, reminders, undo_id: undoId })
})

// POST /api/service-types/:id/merge { into } — fold this type into another:
// records and reminders are repointed, and the losing name (plus its aliases)
// is remembered as an alias so future imports land on the survivor.
router.post('/:id/merge', (req, res) => {
  const db = getDb()
  const loser = db.prepare('SELECT * FROM service_types WHERE id = ?').get(req.params.id)
  const winner = db.prepare('SELECT * FROM service_types WHERE id = ?').get(req.body.into)
  if (!loser || !winner) return res.status(404).json({ error: 'Not found' })
  if (loser.id === winner.id) return res.status(400).json({ error: 'Cannot merge a type into itself' })

  let records = 0
  let reminders = 0
  let undoId = null
  db.transaction(() => {
    const hasWinner = db.prepare('SELECT 1 FROM service_record_items WHERE record_id = ? AND type_id = ?')
    const affected = db.prepare('SELECT DISTINCT record_id FROM service_record_items WHERE type_id = ?').all(loser.id)
      .map(({ record_id }) => ({ id: record_id, had_winner: !!hasWinner.get(record_id, winner.id) }))
    const reminderIds = db.prepare('SELECT id FROM reminders WHERE type_id = ?').all(loser.id).map((r) => r.id)
    const aliasesMoved = db.prepare('SELECT alias FROM service_type_aliases WHERE type_id = ?').all(loser.id).map((a) => a.alias)

    db.prepare('INSERT OR IGNORE INTO service_record_items (record_id, type_id) SELECT record_id, ? FROM service_record_items WHERE type_id = ?')
      .run(winner.id, loser.id)
    db.prepare('DELETE FROM service_record_items WHERE type_id = ?').run(loser.id)
    reminders = db.prepare('UPDATE reminders SET type_id = ?, description = ? WHERE type_id = ?')
      .run(winner.id, winner.name, loser.id).changes
    db.prepare('UPDATE service_type_aliases SET type_id = ? WHERE type_id = ?').run(winner.id, loser.id)
    db.prepare('DELETE FROM service_types WHERE id = ?').run(loser.id)
    const remember = req.body.remember !== false
    let aliasAdded = false
    if (remember) {
      aliasAdded = db.prepare('INSERT OR IGNORE INTO service_type_aliases (alias, type_id) VALUES (?, ?)')
        .run(loser.name, winner.id).changes > 0
    }
    records = affected.length
    const namesFor = db.prepare(`
      SELECT t.name FROM service_record_items i JOIN service_types t ON t.id = i.type_id
      WHERE i.record_id = ? ORDER BY i.rowid
    `)
    const update = db.prepare('UPDATE service_records SET description = ?, items = ? WHERE id = ?')
    for (const { id } of affected) {
      const names = namesFor.all(id).map((r) => r.name)
      update.run(names.join(', '), JSON.stringify(names), id)
    }
    undoId = rememberUndo({
      op: 'merge', winner_id: winner.id,
      loser: { name: loser.name, is_builtin: loser.is_builtin, needs_review: loser.needs_review },
      records: affected, reminder_ids: reminderIds, aliases_moved: aliasesMoved, alias_added: aliasAdded,
    })
  })()
  res.json({ ...db.prepare(`${typeWithCounts} WHERE t.id = ?`).get(winner.id), records, reminders, undo_id: undoId })
})

// POST /api/service-types/undo/:undoId — reverse a just-performed rename or
// merge. Single-use; merges recreate the removed type and restore each
// record's exact pre-merge item set.
router.post('/undo/:undoId', (req, res) => {
  const op = undoOps.get(req.params.undoId)
  if (!op) return res.status(404).json({ error: 'Nothing to undo' })
  undoOps.delete(req.params.undoId)
  const db = getDb()

  const outcome = db.transaction(() => {
    if (op.op === 'rename') {
      const type = db.prepare('SELECT * FROM service_types WHERE id = ?').get(op.type_id)
      if (!type) return { status: 404, body: { error: 'Type no longer exists' } }
      const clash = db.prepare('SELECT id FROM service_types WHERE name = ? AND id != ?').get(op.old_name, type.id)
      if (clash) return { status: 409, body: { error: `“${op.old_name}” exists again — cannot undo` } }
      db.prepare('UPDATE service_types SET name = ?, needs_review = ? WHERE id = ?')
        .run(op.old_name, op.old_needs_review, type.id)
      if (op.alias_added) db.prepare('DELETE FROM service_type_aliases WHERE alias = ? AND type_id = ?').run(op.old_name, type.id)
      syncRecordsUsing(db, type.id)
      db.prepare('UPDATE reminders SET description = ? WHERE type_id = ?').run(op.old_name, type.id)
      return null
    }
    // merge
    const clash = db.prepare('SELECT id FROM service_types WHERE name = ?').get(op.loser.name)
    if (clash) return { status: 409, body: { error: `“${op.loser.name}” exists again — cannot undo` } }
    const { lastInsertRowid } = db.prepare('INSERT INTO service_types (name, is_builtin, needs_review) VALUES (?, ?, ?)')
      .run(op.loser.name, op.loser.is_builtin, op.loser.needs_review)
    const loserId = Number(lastInsertRowid)
    const addLink = db.prepare('INSERT OR IGNORE INTO service_record_items (record_id, type_id) VALUES (?, ?)')
    const dropLink = db.prepare('DELETE FROM service_record_items WHERE record_id = ? AND type_id = ?')
    for (const r of op.records) {
      addLink.run(r.id, loserId)
      if (!r.had_winner) dropLink.run(r.id, op.winner_id)
    }
    for (const rid of op.reminder_ids) {
      db.prepare('UPDATE reminders SET type_id = ?, description = ? WHERE id = ?').run(loserId, op.loser.name, rid)
    }
    for (const alias of op.aliases_moved) {
      db.prepare('UPDATE service_type_aliases SET type_id = ? WHERE alias = ?').run(loserId, alias)
    }
    if (op.alias_added) db.prepare('DELETE FROM service_type_aliases WHERE alias = ? AND type_id = ?').run(op.loser.name, op.winner_id)
    syncRecordsUsing(db, loserId)
    return null
  })()
  if (outcome) return res.status(outcome.status).json(outcome.body)
  res.json({ undone: true })
})

// DELETE /api/service-types/:id — only when nothing references it.
router.delete('/:id', (req, res) => {
  const db = getDb()
  const type = db.prepare(`${typeWithCounts} WHERE t.id = ?`).get(req.params.id)
  if (!type) return res.status(404).json({ error: 'Not found' })
  if (type.record_count > 0 || type.reminder_count > 0) {
    return res.status(400).json({ error: 'In use by records or reminders — rename or merge it instead' })
  }
  db.prepare('DELETE FROM service_types WHERE id = ?').run(type.id)
  res.json({ deleted: true })
})

export default router
