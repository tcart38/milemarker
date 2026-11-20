import { Router } from 'express'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { config } from '../config.js'
import { SqliteStore } from './session-store.js'

/**
 * Optional single-account login.
 *
 * Off unless AUTH_PASSWORD or AUTH_PASSWORD_HASH is set, so existing installs
 * behave exactly as before. When on, every /api route except /api/auth/*
 * needs a session cookie; the static frontend stays public (it holds no data)
 * so the login page can load.
 *
 * Sessions: express-session, persisted in DATA_DIR/sessions.db.
 * Passwords: bcrypt (bcryptjs, pure JS, so no extra native build in Docker).
 * Brute force: express-rate-limit on the login endpoint.
 */

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest()
const sameString = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b))

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  // Generated once and kept beside the database, so sessions survive restarts
  // without asking users to invent a secret.
  const file = path.join(config.dataDir, '.session-secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(config.dataDir, { recursive: true })
  const secret = crypto.randomBytes(32).toString('hex')
  writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

export function authSettings() {
  const hash = (process.env.AUTH_PASSWORD_HASH || '').trim()
  const plain = process.env.AUTH_PASSWORD || ''
  if (hash && !/^\$2[aby]\$\d{2}\$/.test(hash)) {
    throw new Error('AUTH_PASSWORD_HASH is not a bcrypt hash. Generate one with: node src/auth/hash-password.js')
  }
  return {
    enabled: Boolean(hash || plain),
    username: (process.env.AUTH_USERNAME || 'admin').trim(),
    // A plaintext password is hashed once at startup so both paths compare the same way.
    passwordHash: hash || (plain ? bcrypt.hashSync(plain, 10) : null),
    sessionDays: Math.max(1, parseInt(process.env.AUTH_SESSION_DAYS || '30', 10) || 30),
  }
}

export function setupAuth(app) {
  const auth = authSettings()
  const router = Router()

  router.get('/status', (req, res) => {
    res.json({
      enabled: auth.enabled,
      authenticated: !auth.enabled || Boolean(req.session?.user),
      username: req.session?.user || null,
    })
  })

  if (!auth.enabled) {
    app.use('/api/auth', router)
    return { enabled: false }
  }

  app.use(session({
    name: 'milemarker.sid',
    secret: loadSecret(),
    store: new SqliteStore(path.join(config.dataDir, 'sessions.db')),
    resave: false,
    saveUninitialized: false, // no cookie until someone actually signs in
    rolling: true,            // each visit pushes the expiry out again
    cookie: {
      httpOnly: true,
      sameSite: 'lax',        // cross-site POSTs (CSRF) arrive without the cookie
      secure: 'auto',         // Secure when the request is HTTPS (directly or via X-Forwarded-Proto)
      maxAge: auth.sessionDays * 24 * 60 * 60 * 1000,
    },
  }))

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
  })

  router.post('/login', loginLimiter, async (req, res, next) => {
    const { username = '', password = '' } = req.body || {}
    // Always run bcrypt, even for a wrong username, so timing doesn't reveal which part was wrong.
    const passOk = await bcrypt.compare(String(password), auth.passwordHash)
    const userOk = sameString(String(username).trim(), auth.username)
    if (!passOk || !userOk) return res.status(401).json({ error: 'Incorrect username or password' })
    // New session id on login, so a pre-login id can't be fixed onto the victim.
    req.session.regenerate((err) => {
      if (err) return next(err)
      req.session.user = auth.username
      req.session.save((err2) => {
        if (err2) return next(err2)
        res.json({ enabled: true, authenticated: true, username: auth.username })
      })
    })
  })

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err)
      res.clearCookie('milemarker.sid', { httpOnly: true, sameSite: 'lax' })
      res.status(204).end()
    })
  })

  app.use('/api/auth', router)

  // Gate the rest of the API.
  app.use('/api', (req, res, next) => {
    if (req.session?.user) return next()
    res.status(401).json({ error: 'Sign in required' })
  })

  return { enabled: true, username: auth.username }
}
