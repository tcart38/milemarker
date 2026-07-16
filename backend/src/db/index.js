import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'
import { config } from '../config.js'
import { runMigrations } from './schema.js'

let db

export function initDb() {
  mkdirSync(path.dirname(config.dbPath), { recursive: true })
  db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDb() {
  if (!db) throw new Error('DB not initialized — call initDb() first')
  return db
}

// Close and reopen around a restore, which swaps the database file on disk.
export function closeDb() {
  if (db) { db.close(); db = null }
}
