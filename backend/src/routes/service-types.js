import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

// A record's line items: the items JSON array when present, else the legacy
// single description.
function itemsOf(r) {
  try {
    const list = JSON.parse(r.items || 'null')
    if (Array.isArray(list) && list.length > 0) return list.map((s) => String(s).trim()).filter(Boolean)
  } catch { /* fall through to description */ }
  return r.description ? [r.description.trim()] : []
}

// GET /api/service-types — every distinct service item name across all
// vehicles' service records, with usage counts. Case-insensitive; the first
// spelling seen wins as the display name.
router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT items, description FROM service_records').all()
  const counts = new Map()
  for (const r of rows) {
    for (const name of itemsOf(r)) {
      const key = name.toLowerCase()
      const cur = counts.get(key)
      if (cur) cur.count++
      else counts.set(key, { name, count: 1 })
    }
  }
  const list = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  res.json(list)
})

// POST /api/service-types/rename { from, to } — rename a service item name
// everywhere it appears: service record line items (merging duplicates if the
// record already has the target name) and reminders whose description matches.
router.post('/rename', (req, res) => {
  const from = String(req.body.from || '').trim()
  const to = String(req.body.to || '').trim()
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' })
  if (from === to) return res.status(400).json({ error: 'New name is the same as the old one' })

  const db = getDb()
  const fromLc = from.toLowerCase()
  const summary = { records: 0, reminders: 0 }

  db.transaction(() => {
    const rows = db.prepare('SELECT id, items, description FROM service_records').all()
    const update = db.prepare('UPDATE service_records SET items = ?, description = ? WHERE id = ?')
    for (const r of rows) {
      const items = itemsOf(r)
      if (!items.some((i) => i.toLowerCase() === fromLc)) continue
      const next = []
      for (const i of items) {
        const name = i.toLowerCase() === fromLc ? to : i
        if (!next.some((n) => n.toLowerCase() === name.toLowerCase())) next.push(name)
      }
      update.run(JSON.stringify(next), next.join(', '), r.id)
      summary.records++
    }
    summary.reminders = db.prepare('UPDATE reminders SET description = ? WHERE LOWER(description) = LOWER(?)')
      .run(to, from).changes
  })()

  res.json(summary)
})

export default router
