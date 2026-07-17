import express from 'express'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { initDb } from './db/index.js'
import vehiclesRouter from './routes/vehicles.js'
import fuelRouter from './routes/fuel.js'
import recordsRouter from './routes/records.js'
import remindersRouter from './routes/reminders.js'
import dashboardRouter from './routes/dashboard.js'
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
// Extra hostnames (e.g. milemarker.home.lan) go in ALLOWED_HOSTS, comma-separated.
const extraHosts = (process.env.ALLOWED_HOSTS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
app.use((req, res, next) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase()
  const bare = host.replace(/^\[|\]$/g, '') // [::1] → ::1
  const ok =
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    net.isIP(bare) !== 0 ||
    extraHosts.includes(host)
  if (!ok) return res.status(403).json({ error: `Host "${host}" not allowed — add it to ALLOWED_HOSTS` })
  next()
})

app.use(express.json())

app.use('/api/vehicles', vehiclesRouter)
// Nested per-vehicle resources
app.use('/api/vehicles/:vehicleId/fuel', fuelRouter)
app.use('/api/vehicles/:vehicleId/records', recordsRouter)
app.use('/api/vehicles/:vehicleId/reminders', remindersRouter)
app.use('/api/vehicles/:vehicleId/dashboard', dashboardRouter)
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
