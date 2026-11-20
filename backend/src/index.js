import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { initDb } from './db/index.js'
import { isHostAllowed, blockedPage } from './hosts.js'
import vehiclesRouter from './routes/vehicles.js'
import fuelRouter from './routes/fuel.js'
import recordsRouter from './routes/records.js'
import remindersRouter from './routes/reminders.js'
import dashboardRouter from './routes/dashboard.js'
import tiresRouter from './routes/tires.js'
import attachmentsRouter from './routes/attachments.js'
import settingsRouter from './routes/settings.js'
import serviceTypesRouter from './routes/service-types.js'
import importRouter from './routes/import.js'
import backupRouter from './routes/backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

initDb()

const app = express()
app.disable('x-powered-by')

// There is no auth: the browser's same-origin policy is the only thing keeping
// random websites from driving this API. So no CORS (the frontend is always
// same-origin), and a Host-header allowlist to block DNS-rebinding attacks.
// Extra hostnames come from Settings → Network in the app, or from ALLOWED_HOSTS
// (comma-separated). A leading dot (".home.lan") allows that domain and all its
// subdomains; "*" turns the check off.
app.use((req, res, next) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase()
  if (isHostAllowed(host)) return next()
  const message = `Host "${host}" not allowed — add it to ALLOWED_HOSTS`
  if (req.accepts(['json', 'html']) === 'html') return res.status(403).type('html').send(blockedPage(host))
  res.status(403).json({ error: message })
})

app.use(express.json())

app.use('/api/vehicles', vehiclesRouter)
// Nested per-vehicle resources
app.use('/api/vehicles/:vehicleId/fuel', fuelRouter)
app.use('/api/vehicles/:vehicleId/records', recordsRouter)
app.use('/api/vehicles/:vehicleId/reminders', remindersRouter)
app.use('/api/vehicles/:vehicleId/dashboard', dashboardRouter)
app.use('/api/vehicles/:vehicleId/tires', tiresRouter)
app.use('/api/attachments', attachmentsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/service-types', serviceTypesRouter)
app.use('/api/import', importRouter)
app.use('/api/backup', backupRouter)

// Serve the built frontend in production (single-container Docker).
if (config.isProd) {
  const publicDir = path.join(__dirname, '../public')
  app.use(express.static(publicDir))
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')))
}

app.listen(config.port, () => {
  console.log(`MileMarker running on http://localhost:${config.port}`)
  console.log(`  Data dir : ${config.dataDir}`)
})
