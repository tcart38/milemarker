import { Router } from 'express'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'
import { config } from '../config.js'
import { SqliteStore } from './session-store.js'

/**
 * Optional single-account login, set up from Settings in the app.
 *
 * Off until someone creates the account, so existing installs behave exactly
 * as before. When on, every /api route except /api/auth/* needs a session;
 * the static frontend stays public (it holds no data) so the sign-in screen
 * can load.
 *
 * The account and sessions live in DATA_DIR/auth.db, apart from
 * milemarker.db, so backups never carry the password hash or sessions and
 * restoring an old backup can't silently turn login off.
 *
 * Locked out? Set the container variable AUTH_DISABLED=true and restart:
 * the account is removed and login stays off while the variable is set.
 *
 * Sessions: express-session. Passwords: bcrypt (bcryptjs, pure JS, so no
 * extra native build in Docker). Brute force: express-rate-limit.
 */

const MIN_PASSWORD = 8
const SESSION_DAYS = 30
const forcedOff = /^(1|true|yes)$/i.test(process.env.AUTH_DISABLED || '')

function openAuthDb() {
  mkdirSync(config.dataDir, { recursive: true })
  const db = new Database(path.join(config.dataDir, 'auth.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY CHECK (id = 1),   -- one account
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return db
}

// Signs session cookies. Generated once and kept in auth.db.
function sessionSecret(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'session_secret'").get()
  if (row) return row.value
  const secret = crypto.randomBytes(32).toString('hex')
  db.prepare("INSERT INTO meta (key, value) VALUES ('session_secret', ?)").run(secret)
  return secret
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest()
const sameString = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b))

function validate({ username, password }) {
  if (username !== undefined && !String(username).trim()) return 'Enter a username'
  if (String(password || '').length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters`
  if (Buffer.byteLength(String(password)) > 72) return 'Use a password of at most 72 bytes'
  return null
}

export function setupAuth(app) {
  const db = openAuthDb()
  const store = new SqliteStore(db)
  const q = {
    get: db.prepare('SELECT username, password_hash FROM account WHERE id = 1'),
    upsert: db.prepare(`INSERT INTO account (id, username, password_hash) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET username = excluded.username,
        password_hash = excluded.password_hash, updated_at = datetime('now')`),
    remove: db.prepare('DELETE FROM account'),
  }

  if (forcedOff && q.get.get()) {
    q.remove.run()
    store.clearOthers(null)
    console.log('AUTH_DISABLED is set: removed the login account. Remove the variable to set up a new one in Settings.')
  }

  const account = () => (forcedOff ? null : q.get.get())

  // A dummy hash so a sign-in with no account set up still spends bcrypt time.
  const dummyHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10)
  const checkPassword = (password, acct) => bcrypt.compare(String(password || ''), acct?.password_hash || dummyHash)

  app.use(session({
    name: 'milemarker.sid',
    secret: sessionSecret(db),
    store,
    resave: false,
    saveUninitialized: false, // no cookie at all until someone signs in
    rolling: true,            // each visit pushes the expiry out again
    cookie: {
      httpOnly: true,
      sameSite: 'lax',        // cross-site POSTs (CSRF) arrive without the cookie
      secure: 'auto',         // Secure when the request is HTTPS (directly or via X-Forwarded-Proto)
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    },
  }))

  const signedIn = (req) => {
    const acct = account()
    return Boolean(acct && req.session?.user && req.session.user === acct.username)
  }

  const status = (req) => {
    const acct = account()
    return {
      enabled: Boolean(acct),
      authenticated: !acct || signedIn(req),
      username: acct && signedIn(req) ? acct.username : null,
      forcedOff,
    }
  }

  // New session id on sign-in, so a pre-login id can't be fixed onto the victim.
  const startSession = (req, username) => new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err)
      req.session.user = username
      req.session.save((err2) => (err2 ? reject(err2) : resolve()))
    })
  })

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in a few minutes.' },
  })

  const router = Router()
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

  router.get('/status', (req, res) => res.json(status(req)))

  // Turn login on. Only possible while it's off, which is the same trust
  // level as everything else in the app when there is no login.
  router.post('/setup', wrap(async (req, res) => {
    if (forcedOff) return res.status(409).json({ error: 'Sign-in is turned off by the AUTH_DISABLED container variable' })
    if (account()) return res.status(409).json({ error: 'Sign-in is already set up' })
    const { username = '', password = '' } = req.body || {}
    const problem = validate({ username, password })
    if (problem) return res.status(400).json({ error: problem })
    const name = String(username).trim()
    q.upsert.run(name, await bcrypt.hash(String(password), 12))
    store.clearOthers(null)
    await startSession(req, name)
    res.json(status(req))
  }))

  router.post('/login', limiter, wrap(async (req, res) => {
    const acct = account()
    const { username = '', password = '' } = req.body || {}
    // Always run bcrypt, even for a wrong username, so timing doesn't reveal which part was wrong.
    const passOk = await checkPassword(password, acct)
    const userOk = Boolean(acct) && sameString(String(username).trim(), acct.username)
    if (!acct || !passOk || !userOk) return res.status(401).json({ error: 'Incorrect username or password' })
    await startSession(req, acct.username)
    res.json(status(req))
  }))

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err)
      res.clearCookie('milemarker.sid', { httpOnly: true, sameSite: 'lax' })
      res.status(204).end()
    })
  })

  // Changes below need the current password as well as a session, so a
  // device left signed in can't be used to take over the account.
  router.post('/account', limiter, wrap(async (req, res) => {
    const acct = account()
    if (!acct || !signedIn(req)) return res.status(401).json({ error: 'Sign in required' })
    const { current_password = '', username, password } = req.body || {}
    if (!(await checkPassword(current_password, acct))) return res.status(401).json({ error: 'Current password is incorrect', field: 'current_password' })
    const newName = username === undefined ? acct.username : String(username).trim()
    if (!newName) return res.status(400).json({ error: 'Enter a username' })
    let hash = acct.password_hash
    if (password) {
      const problem = validate({ password })
      if (problem) return res.status(400).json({ error: problem })
      hash = await bcrypt.hash(String(password), 12)
    }
    q.upsert.run(newName, hash)
    if (password) store.clearOthers(req.sessionID) // sign out other devices
    req.session.user = newName
    req.session.save(() => res.json(status(req)))
  }))

  router.post('/disable', limiter, wrap(async (req, res) => {
    const acct = account()
    if (!acct || !signedIn(req)) return res.status(401).json({ error: 'Sign in required' })
    if (!(await checkPassword(req.body?.current_password, acct))) return res.status(401).json({ error: 'Current password is incorrect', field: 'current_password' })
    q.remove.run()
    store.clearOthers(req.sessionID)
    req.session.destroy(() => {
      res.clearCookie('milemarker.sid', { httpOnly: true, sameSite: 'lax' })
      res.json({ enabled: false, authenticated: true, username: null, forcedOff })
    })
  }))

  app.use('/api/auth', router)

  // Gate the rest of the API whenever an account exists.
  app.use('/api', (req, res, next) => {
    if (!account() || signedIn(req)) return next()
    res.status(401).json({ error: 'Sign in required' })
  })

  return { enabled: () => Boolean(account()), forcedOff }
}
