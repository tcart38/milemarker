import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { config } from '../config.js'
import { getDb } from '../db/index.js'
import { readLiteDb } from '../lib/litedb.js'
import { resolveServiceTypes, setRecordItems } from './service-types.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 2000 } })

const dateStr = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : null)

function addMonths(dateStr_, months) {
  const d = new Date(dateStr_ + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// LubeLogger stores reminder intervals as enum names; "Other" uses the custom fields.
const MILEAGE_ENUM = {
  OneThousandMiles: 1000, ThreeThousandMiles: 3000, FiveThousandMiles: 5000,
  TenThousandMiles: 10000, FifteenThousandMiles: 15000, ThirtyThousandMiles: 30000,
  SixtyThousandMiles: 60000, NinetyThousandMiles: 90000,
}
const MONTH_ENUM = {
  OneMonth: 1, ThreeMonths: 3, SixMonths: 6, OneYear: 12,
  TwoYears: 24, ThreeYears: 36, FiveYears: 60, TenYears: 120,
}

function reminderIntervals(r) {
  let miles = MILEAGE_ENUM[r.ReminderMileageInterval] ?? null
  if (r.ReminderMileageInterval === 'Other') miles = r.CustomMileageInterval || null
  let months = MONTH_ENUM[r.ReminderMonthInterval] ?? null
  if (r.ReminderMonthInterval === 'Other') {
    const v = r.CustomMonthInterval || 0
    const unit = r.CustomMonthIntervalUnit || 'Months'
    const inMonths = unit === 'Days' ? v / 30.44 : unit === 'Weeks' ? v / 4.345 : unit === 'Years' ? v * 12 : v
    months = v ? Math.max(1, Math.round(inMonths)) : null
  }
  return { miles, months }
}

// A LubeLogger record's Files: [{ Name, Location: '/images/xx.jpg' | '/documents/xx.pdf' }]
// Match by relative path when the client preserved it, else by basename — LubeLogger
// names stored files with GUIDs, so basenames are unique.
function findUploaded(filesByPath, location) {
  if (!location) return null
  const want = location.replace(/^\//, '') // 'images/xx.jpg'
  const base = path.basename(want)
  let byBase = null
  for (const [rel, f] of filesByPath) {
    if (rel === want || rel.endsWith('/' + want)) return f
    if (path.basename(rel) === base) byBase = f
  }
  return byBase
}

// POST /api/import/lubelogger — multipart upload of the whole LubeLogger appdata
// folder (field "files", each part named by its relative path). Finds the LiteDB
// database, imports vehicles + records + reminders, and copies attachment files.
router.post('/lubelogger', upload.array('files'), (req, res) => {
  const files = req.files || []
  const filesByPath = new Map(files.map((f) => [f.originalname.replace(/\\/g, '/').replace(/^\//, ''), f]))

  const dbFile = files.find((f) => /(^|\/)cartracker\.db$/i.test(f.originalname)) ||
    files.find((f) => f.originalname.endsWith('.db') && !/-log\.db$/.test(f.originalname) &&
      f.buffer.length > 64 && f.buffer.toString('latin1', 32, 59) === '** This is a LiteDB file **')
  if (!dbFile) {
    return res.status(400).json({ error: 'No LubeLogger database found — the folder should contain data/cartracker.db' })
  }

  let parsed
  try {
    parsed = readLiteDb(dbFile.buffer)
  } catch (err) {
    return res.status(400).json({ error: `Could not read LubeLogger database: ${err.message}` })
  }
  const col = (name) => parsed.docs[name] || []

  const db = getDb()
  mkdirSync(config.uploadsDir, { recursive: true })
  const copiedFiles = [] // for cleanup if the transaction fails
  const summary = {
    vehicles: 0, fuel: 0, service: 0, repair: 0, upgrade: 0,
    odometer: 0, reminders: 0, attachments: 0, missing_files: [], skipped_vehicles: [],
  }

  // Write one LubeLogger-referenced file into our uploads dir; returns filepath or null.
  const copyUpload = (location) => {
    const src = findUploaded(filesByPath, location)
    if (!src) { summary.missing_files.push(location); return null }
    const ext = path.extname(location)
    const dest = path.join(config.uploadsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    writeFileSync(dest, src.buffer)
    copiedFiles.push(dest)
    return dest
  }

  const insertAttachment = db.prepare('INSERT INTO attachments (record_type, record_id, filename, filepath) VALUES (?, ?, ?, ?)')
  const attach = (recordType, recordId, llFiles) => {
    for (const f of llFiles || []) {
      const filepath = copyUpload(f.Location)
      if (!filepath) continue
      insertAttachment.run(recordType, recordId, f.Name || path.basename(f.Location), filepath)
      summary.attachments++
    }
  }

  const run = db.transaction(() => {
    const vehicleIdMap = new Map() // LubeLogger id -> MileMarker id

    for (const v of col('vehicles')) {
      const year = v.Year || null, make = v.Make || null, model = v.Model || null, plate = v.LicensePlate || null
      const dupe = db.prepare(
        'SELECT id FROM vehicles WHERE COALESCE(year,\'\') = COALESCE(?,\'\') AND COALESCE(make,\'\') = COALESCE(?,\'\') AND COALESCE(model,\'\') = COALESCE(?,\'\') AND COALESCE(license_plate,\'\') = COALESCE(?,\'\')'
      ).get(year, make, model, plate)
      if (dupe) {
        summary.skipped_vehicles.push([year, make, model, plate].filter(Boolean).join(' '))
        continue
      }
      const soldDate = dateStr(v.SoldDate)
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO vehicles (year, make, model, license_plate, purchase_date, notes,
                              is_electric, purchase_price, sold_price, sold_date, is_archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(year, make, model, plate, dateStr(v.PurchaseDate), v.Notes || null,
             v.IsElectric ? 1 : 0, v.PurchasePrice || null, v.SoldPrice || null,
             soldDate, soldDate ? 1 : 0)
      vehicleIdMap.set(v._id, Number(lastInsertRowid))
      summary.vehicles++
      if (v.ImageLocation && !v.ImageLocation.startsWith('/defaults/')) {
        attach('vehicle', Number(lastInsertRowid), [{ Name: path.basename(v.ImageLocation), Location: v.ImageLocation }])
      }
    }

    for (const g of col('gasrecords')) {
      const vid = vehicleIdMap.get(g.VehicleId)
      if (!vid || !dateStr(g.Date)) continue
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO fuel_records (vehicle_id, date, odometer, quantity, cost, is_fill_to_full, missed_fuelup, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(vid, dateStr(g.Date), g.Mileage ?? 0, g.Gallons ?? 0, g.Cost ?? 0,
             g.IsFillToFull === false ? 0 : 1, g.MissedFuelUp ? 1 : 0, g.Notes || null)
      summary.fuel++
      attach('fuel', Number(lastInsertRowid), g.Files)
    }

    const recordSets = [
      ['servicerecords', 'service_records', 'service'],
      ['collisionrecords', 'repair_records', 'repair'],
      ['upgraderecords', 'upgrade_records', 'upgrade'],
    ]
    for (const [colNameLL, table, type] of recordSets) {
      for (const r of col(colNameLL)) {
        const vid = vehicleIdMap.get(r.VehicleId)
        if (!vid || !dateStr(r.Date)) continue
        let desc = (r.Description || 'Imported record').trim()
        let resolved = null
        if (type === 'service') {
          resolved = resolveServiceTypes(db, [desc], { fromImport: true })
          desc = resolved.names.join(', ')
        }
        const { lastInsertRowid } = db.prepare(`
          INSERT INTO ${table} (vehicle_id, date, odometer, description, items, cost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(vid, dateStr(r.Date), r.Mileage || null, desc, JSON.stringify(resolved ? resolved.names : [desc]), r.Cost ?? 0, r.Notes || null)
        if (resolved) setRecordItems(db, Number(lastInsertRowid), resolved.ids, resolved.names)
        summary[type]++
        attach(type, Number(lastInsertRowid), r.Files)
      }
    }

    for (const o of col('odometerrecords')) {
      const vid = vehicleIdMap.get(o.VehicleId)
      if (!vid || !dateStr(o.Date) || o.Mileage == null) continue
      db.prepare('INSERT INTO odometer_records (vehicle_id, date, odometer, notes) VALUES (?, ?, ?, ?)')
        .run(vid, dateStr(o.Date), o.Mileage, o.Notes || null)
      summary.odometer++
    }

    for (const r of col('reminderrecords')) {
      const vid = vehicleIdMap.get(r.VehicleId)
      if (!vid || !r.Description) continue
      const metric = r.Metric || 'Date'
      const useDate = metric === 'Date' || metric === 'Both'
      const useOdo = metric === 'Odometer' || metric === 'Both'
      const due_date = useDate ? dateStr(r.Date) : null
      const due_odometer = useOdo && r.Mileage != null ? r.Mileage : null

      if (r.IsRecurring) {
        const { miles, months } = reminderIntervals(r)
        const interval_miles = useOdo ? miles : null
        const interval_months = useDate ? months : null
        if (!interval_miles && !interval_months) continue
        const resolvedType = resolveServiceTypes(db, [r.Description], { fromImport: true })
        // LubeLogger stores the NEXT due point; our recurring model anchors on
        // last-done, so walk one interval back from the due point.
        const base_date = due_date && interval_months ? addMonths(due_date, -interval_months) : null
        const base_odometer = due_odometer != null && interval_miles ? due_odometer - interval_miles : null
        db.prepare(`
          INSERT INTO reminders (vehicle_id, description, type_id, is_recurring, interval_miles, interval_months, base_date, base_odometer)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        `).run(vid, resolvedType.names[0], resolvedType.ids[0], interval_miles, interval_months, base_date, base_odometer)
      } else {
        if (!due_date && due_odometer == null) continue
        const resolvedType = resolveServiceTypes(db, [r.Description], { fromImport: true })
        db.prepare(`
          INSERT INTO reminders (vehicle_id, description, type_id, is_recurring, due_date, due_odometer)
          VALUES (?, ?, ?, 0, ?, ?)
        `).run(vid, resolvedType.names[0], resolvedType.ids[0], due_date, due_odometer)
      }
      summary.reminders++
    }
  })

  try {
    run()
  } catch (err) {
    for (const f of copiedFiles) { try { unlinkSync(f) } catch { /* best effort */ } }
    return res.status(500).json({ error: `Import failed, nothing was changed: ${err.message}` })
  }
  res.json(summary)
})

/* ---------- CSV import ---------- */

// Minimal RFC-4180 parser: quoted fields, escaped quotes, embedded newlines.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const CSV_TYPES = new Set(['fuel', 'service', 'repair', 'upgrade', 'odometer'])

// Accept YYYY-MM-DD or M/D/YYYY; return YYYY-MM-DD or null.
function csvDate(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

const truthy = (s, dflt) => (s === '' || s == null ? dflt : /^(1|true|yes|y)$/i.test(s))

// POST /api/import/csv — multipart: file (CSV) + vehicle_id (default target).
// Rows may override the vehicle via a "vehicle" column (nickname, plate, or
// "year make model"). All-or-nothing: any invalid row aborts the whole import.
router.post('/csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' })
  const db = getDb()

  const vehicles = db.prepare('SELECT * FROM vehicles').all()
  const byKey = new Map()
  for (const v of vehicles) {
    if (v.name) byKey.set(v.name.toLowerCase(), v.id)
    if (v.license_plate) byKey.set(v.license_plate.toLowerCase(), v.id)
    byKey.set([v.year, v.make, v.model].filter(Boolean).join(' ').toLowerCase(), v.id)
  }
  const defaultVehicle = req.body.vehicle_id ? Number(req.body.vehicle_id) : null
  if (defaultVehicle && !vehicles.some((v) => v.id === defaultVehicle)) {
    return res.status(400).json({ error: 'Unknown vehicle_id' })
  }

  let rows
  try { rows = parseCsv(req.file.buffer.toString('utf8')) }
  catch (err) { return res.status(400).json({ error: `Could not parse CSV: ${err.message}` }) }
  if (rows.length === 0) return res.status(400).json({ error: 'CSV has no data rows' })

  // Validate every row up front so errors report line numbers and nothing partial lands.
  const errors = []
  const prepared = []
  rows.forEach((r, i) => {
    const line = i + 2 // 1-based + header row
    const fail = (msg) => errors.push({ row: line, error: msg })

    const type = (r.type || '').toLowerCase()
    if (!CSV_TYPES.has(type)) return fail(`type must be one of ${[...CSV_TYPES].join(', ')} (got "${r.type}")`)

    let vehicleId = defaultVehicle
    if (r.vehicle) {
      vehicleId = byKey.get(r.vehicle.toLowerCase()) ?? null
      if (!vehicleId) return fail(`vehicle "${r.vehicle}" doesn't match any vehicle (nickname, plate, or "year make model")`)
    }
    if (!vehicleId) return fail('no vehicle: pick one in the import form or add a "vehicle" column')

    const date = csvDate(r.date || '')
    if (!date) return fail(`date must be YYYY-MM-DD (got "${r.date}")`)

    const odometer = r.odometer === '' || r.odometer == null ? null : parseInt(String(r.odometer).replace(/[,\s]/g, ''), 10)
    if (r.odometer && Number.isNaN(odometer)) return fail(`odometer isn't a number ("${r.odometer}")`)
    const cost = r.cost === '' || r.cost == null ? null : parseFloat(String(r.cost).replace(/[$,\s]/g, ''))
    if (r.cost && Number.isNaN(cost)) return fail(`cost isn't a number ("${r.cost}")`)

    if (type === 'fuel') {
      const quantity = parseFloat(String(r.quantity ?? '').replace(/[,\s]/g, ''))
      if (odometer == null) return fail('fuel rows need an odometer')
      if (Number.isNaN(quantity)) return fail('fuel rows need a quantity')
      if (cost == null) return fail('fuel rows need a cost')
      prepared.push({
        type, vehicleId, date, odometer, quantity, cost,
        is_fill_to_full: truthy(r.is_fill_to_full, true), missed_fuelup: truthy(r.missed_fuelup, false),
        notes: r.notes || null,
      })
    } else if (type === 'odometer') {
      if (odometer == null) return fail('odometer rows need an odometer reading')
      prepared.push({ type, vehicleId, date, odometer, notes: r.notes || null })
    } else {
      const items = (r.description || '').split(';').map((s) => s.trim()).filter(Boolean)
      if (items.length === 0) return fail(`${type} rows need a description`)
      prepared.push({ type, vehicleId, date, odometer, items, cost: cost ?? 0, notes: r.notes || null })
    }
  })
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Nothing was imported — fix these rows and retry', errors })
  }

  const summary = { fuel: 0, service: 0, repair: 0, upgrade: 0, odometer: 0, skipped_duplicates: 0 }
  const TABLE = { service: 'service_records', repair: 'repair_records', upgrade: 'upgrade_records' }

  db.transaction(() => {
    for (const p of prepared) {
      if (p.type === 'fuel') {
        const dupe = db.prepare('SELECT id FROM fuel_records WHERE vehicle_id = ? AND date = ? AND odometer = ?')
          .get(p.vehicleId, p.date, p.odometer)
        if (dupe) { summary.skipped_duplicates++; continue }
        db.prepare(`
          INSERT INTO fuel_records (vehicle_id, date, odometer, quantity, cost, is_fill_to_full, missed_fuelup, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(p.vehicleId, p.date, p.odometer, p.quantity, p.cost, p.is_fill_to_full ? 1 : 0, p.missed_fuelup ? 1 : 0, p.notes)
        summary.fuel++
      } else if (p.type === 'odometer') {
        const dupe = db.prepare('SELECT id FROM odometer_records WHERE vehicle_id = ? AND date = ? AND odometer = ?')
          .get(p.vehicleId, p.date, p.odometer)
        if (dupe) { summary.skipped_duplicates++; continue }
        db.prepare('INSERT INTO odometer_records (vehicle_id, date, odometer, notes) VALUES (?, ?, ?, ?)')
          .run(p.vehicleId, p.date, p.odometer, p.notes)
        summary.odometer++
      } else {
        // Service names resolve through remembered aliases, so a re-import of a
        // previously cleaned-up spelling both dedupes and tags correctly.
        const resolved = p.type === 'service' ? resolveServiceTypes(db, p.items, { fromImport: true }) : null
        const names = resolved ? resolved.names : p.items
        const desc = names.join(', ')
        const dupe = db.prepare(`SELECT id FROM ${TABLE[p.type]} WHERE vehicle_id = ? AND date = ? AND description = ? AND cost = ?`)
          .get(p.vehicleId, p.date, desc, p.cost)
        if (dupe) { summary.skipped_duplicates++; continue }
        const { lastInsertRowid } = db.prepare(`
          INSERT INTO ${TABLE[p.type]} (vehicle_id, date, odometer, description, items, cost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(p.vehicleId, p.date, p.odometer, desc, JSON.stringify(names), p.cost, p.notes)
        if (resolved) setRecordItems(db, Number(lastInsertRowid), resolved.ids, resolved.names)
        summary[p.type]++
      }
    }
  })()

  res.json(summary)
})

export default router
