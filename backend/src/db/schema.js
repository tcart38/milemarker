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

  seed(db)
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
