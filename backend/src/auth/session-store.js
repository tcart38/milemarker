import Database from 'better-sqlite3'
import session from 'express-session'

/**
 * express-session store backed by its own SQLite file (DATA_DIR/sessions.db).
 *
 * Kept apart from milemarker.db on purpose: backups never carry login
 * sessions, and a restore (which swaps milemarker.db on disk) doesn't sign
 * everyone out or break this store's open handle. express-session does the
 * security-sensitive parts (id generation, cookie signing); this only persists
 * the session JSON so logins survive a container restart.
 */
export class SqliteStore extends session.Store {
  constructor(file) {
    super()
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`)
    this.q = {
      get: this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?'),
      set: this.db.prepare(`INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`),
      touch: this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
      prune: this.db.prepare('DELETE FROM sessions WHERE expires <= ?'),
    }
    this.prune()
    setInterval(() => this.prune(), 60 * 60 * 1000).unref()
  }

  static expiry(sess) {
    const e = sess?.cookie?.expires
    return e ? new Date(e).getTime() : Date.now() + 24 * 60 * 60 * 1000
  }

  prune() { this.q.prune.run(Date.now()) }

  get(sid, cb) {
    try {
      const row = this.q.get.get(sid, Date.now())
      cb(null, row ? JSON.parse(row.sess) : null)
    } catch (err) { cb(err) }
  }

  set(sid, sess, cb = () => {}) {
    try { this.q.set.run(sid, JSON.stringify(sess), SqliteStore.expiry(sess)); cb(null) } catch (err) { cb(err) }
  }

  touch(sid, sess, cb = () => {}) {
    try { this.q.touch.run(SqliteStore.expiry(sess), sid); cb(null) } catch (err) { cb(err) }
  }

  destroy(sid, cb = () => {}) {
    try { this.q.destroy.run(sid); cb(null) } catch (err) { cb(err) }
  }
}
