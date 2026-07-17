export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,                       -- optional display name/nickname
      year INTEGER,
      make TEXT,
      model TEXT,
      license_plate TEXT,
      purchase_date TEXT,
      notes TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Fuel / fill-up records (special: gallons + fuel-economy flags)
    CREATE TABLE IF NOT EXISTS fuel_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER NOT NULL,
      quantity REAL NOT NULL,          -- gallons or litres
      cost REAL NOT NULL,
      is_fill_to_full INTEGER NOT NULL DEFAULT 1,
      missed_fuelup INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Service, repair, and upgrade records all share this shape.
    CREATE TABLE IF NOT EXISTS service_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      description TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS repair_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      description TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS upgrade_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      description TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS odometer_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER NOT NULL,
      notes TEXT,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Reminders: due by date and/or odometer, optionally recurring on an interval.
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      notes TEXT,
      metric TEXT NOT NULL DEFAULT 'date', -- 'date' | 'odometer' | 'both'
      due_date TEXT,
      due_odometer INTEGER,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      interval_months INTEGER,
      interval_miles INTEGER,
      is_complete INTEGER NOT NULL DEFAULT 0,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,       -- 'fuel' | 'service' | 'repair' | 'upgrade' | 'vehicle'
      record_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Service types are first-class: records and reminders reference them by id,
    -- so a rename is one row and merge/review are real operations.
    CREATE TABLE IF NOT EXISTS service_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,  -- created by an import, awaiting a human decision
      date_added TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS service_record_items (
      record_id INTEGER NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL REFERENCES service_types(id),
      PRIMARY KEY (record_id, type_id)
    );
    -- Spellings previously merged/renamed away; future imports map through these.
    CREATE TABLE IF NOT EXISTS service_type_aliases (
      alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
      type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fuel_vehicle ON fuel_records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_service_vehicle ON service_records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_repair_vehicle ON repair_records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_upgrade_vehicle ON upgrade_records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_odometer_vehicle ON odometer_records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_vehicle ON reminders(vehicle_id);
  `)

  // Migrations for columns added after the initial release.
  // Interval reminders anchor off an optional manual "last done" baseline.
  try { db.exec('ALTER TABLE reminders ADD COLUMN base_date TEXT') } catch {}
  try { db.exec('ALTER TABLE reminders ADD COLUMN base_odometer INTEGER') } catch {}

  // A service/repair/upgrade record can cover multiple line items (e.g. oil
  // change + tire rotation). Stored as a JSON array; `description` keeps a
  // joined summary for display and backward compatibility.
  try { db.exec('ALTER TABLE service_records ADD COLUMN items TEXT') } catch {}
  try { db.exec('ALTER TABLE repair_records ADD COLUMN items TEXT') } catch {}
  try { db.exec('ALTER TABLE upgrade_records ADD COLUMN items TEXT') } catch {}

  // Vehicles can be marked as sold (archived with a sale date).
  try { db.exec('ALTER TABLE vehicles ADD COLUMN sold_date TEXT') } catch {}

  // Ownership economics + EV support.
  try { db.exec('ALTER TABLE vehicles ADD COLUMN purchase_price REAL') } catch {}
  try { db.exec('ALTER TABLE vehicles ADD COLUMN sold_price REAL') } catch {}
  try { db.exec('ALTER TABLE vehicles ADD COLUMN is_electric INTEGER NOT NULL DEFAULT 0') } catch {}

  // Interval reminders predate one-time reminders; rows with an interval are
  // recurring by definition (one-time reminders never have intervals), so this
  // backfill is idempotent.
  db.exec('UPDATE reminders SET is_recurring = 1 WHERE interval_miles IS NOT NULL OR interval_months IS NOT NULL')

  // Reminders link the service type they track (kept in sync on rename/merge).
  try { db.exec('ALTER TABLE reminders ADD COLUMN type_id INTEGER REFERENCES service_types(id)') } catch {}

  seed(db)
  migrateServiceTypes(db)
}

// Formerly frontend presets — now seed rows, editable/deletable like any type.
const BUILTIN_SERVICE_TYPES = [
  'Oil change', 'Tire rotation', 'Engine air filter', 'Cabin air filter',
  'Front brake pads', 'Rear brake pads', 'Front rotors', 'Rear rotors',
  'Brake fluid flush', 'Transmission fluid', 'Coolant flush',
  'Spark plugs', 'Battery replacement', 'Wiper blades', 'Wheel alignment',
  'Tire balance', 'Fuel filter', 'Serpentine belt', 'Timing belt',
  'Differential fluid', 'Transfer case fluid', 'Power steering fluid',
  'A/C service', 'Safety inspection', 'Emissions test',
  'Registration renewal', 'Tire replacement', 'Wash / detail',
]

// One-time backfill into the service_types world, guarded by a settings marker
// so user deletions of built-ins are never undone on a later boot. Runs on any
// database that predates the marker — including restored backups.
function migrateServiceTypes(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'service_types_seeded'").get()
  if (done) return

  const itemsOf = (r) => {
    if (r.items) { try { const a = JSON.parse(r.items); if (Array.isArray(a)) return a } catch { /* fall through */ } }
    return r.description ? [r.description] : []
  }

  db.transaction(() => {
    const insertType = db.prepare('INSERT INTO service_types (name, is_builtin, needs_review) VALUES (?, ?, ?)')
    const findType = db.prepare('SELECT id, name FROM service_types WHERE name = ? COLLATE NOCASE')
    // Resolve a name to a type id, creating it if new. First spelling seen wins.
    const resolve = (name, needsReview) => {
      const existing = findType.get(name)
      if (existing) return existing.id
      return Number(insertType.run(name, 0, needsReview ? 1 : 0).lastInsertRowid)
    }

    for (const name of BUILTIN_SERVICE_TYPES) {
      if (!findType.get(name)) insertType.run(name, 1, 0)
    }

    // The user's curated list moves over as reviewed types.
    const customRow = db.prepare("SELECT value FROM settings WHERE key = 'custom_services'").get()
    if (customRow) {
      try {
        for (const raw of JSON.parse(customRow.value)) {
          const name = String(raw).trim()
          if (name) resolve(name, false)
        }
      } catch { /* malformed custom list — nothing to migrate */ }
      db.prepare("DELETE FROM settings WHERE key = 'custom_services'").run()
    }

    // Names only found in records (typically imports) arrive flagged for review.
    const link = db.prepare('INSERT OR IGNORE INTO service_record_items (record_id, type_id) VALUES (?, ?)')
    for (const r of db.prepare('SELECT id, items, description FROM service_records').all()) {
      for (const raw of itemsOf(r)) {
        const name = String(raw).trim()
        if (name) link.run(r.id, resolve(name, true))
      }
    }

    // Every reminder gets a type so rename/merge keep it tracking correctly.
    const setReminderType = db.prepare('UPDATE reminders SET type_id = ? WHERE id = ?')
    for (const r of db.prepare('SELECT id, description FROM reminders').all()) {
      const name = (r.description || '').trim()
      if (name) setReminderType.run(resolve(name, false), r.id)
    }

    db.prepare("INSERT INTO settings (key, value) VALUES ('service_types_seeded', '1')").run()
  })()
}

function seed(db) {
  const defaults = {
    distance_unit: 'mi',      // 'mi' | 'km'
    volume_unit: 'gal',       // 'gal' | 'L'
    currency_symbol: '$',
    date_format: 'MM/DD/YYYY',
  }
  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
  for (const [k, v] of Object.entries(defaults)) insert.run(k, v)
}
