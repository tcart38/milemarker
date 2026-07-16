import { Router } from 'express'
import { getDb } from '../db/index.js'
import { currentOdometer } from './vehicles.js'
import { decoratedReminders } from './reminders.js'

const router = Router({ mergeParams: true })

// GET /api/vehicles/:vehicleId/dashboard — aggregate stats + a monthly-spend series
router.get('/', (req, res) => {
  const db = getDb()
  const id = req.params.vehicleId
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id)
  if (!vehicle) return res.status(404).json({ error: 'Not found' })

  const sum = (table) =>
    db.prepare(`SELECT COALESCE(SUM(cost),0) AS c FROM ${table} WHERE vehicle_id = ?`).get(id).c

  const fuelCost = sum('fuel_records')
  const serviceCost = sum('service_records')
  const repairCost = sum('repair_records')
  const upgradeCost = sum('upgrade_records')
  const totalCost = fuelCost + serviceCost + repairCost + upgradeCost

  const fuelAgg = db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(quantity),0) AS qty FROM fuel_records WHERE vehicle_id = ?'
  ).get(id)

  const odo = currentOdometer(db, id)

  // Overall fuel economy across the tracked span (fill-to-full records only).
  const fulls = db.prepare(
    'SELECT odometer, quantity FROM fuel_records WHERE vehicle_id = ? AND is_fill_to_full = 1 ORDER BY odometer'
  ).all(id)
  let avgEconomy = null
  if (fulls.length >= 2) {
    const dist = fulls[fulls.length - 1].odometer - fulls[0].odometer
    const qty = fulls.slice(1).reduce((s, r) => s + r.quantity, 0) // exclude the first tank
    if (dist > 0 && qty > 0) avgEconomy = +(dist / qty).toFixed(2)
  }

  const costPerDistance = odo != null && odo > 0 ? +(totalCost / odo).toFixed(3) : null

  // Monthly spend (last 12 months) across all cost-bearing records.
  const monthly = db.prepare(`
    SELECT month, SUM(cost) AS cost FROM (
      SELECT substr(date,1,7) AS month, cost FROM fuel_records    WHERE vehicle_id = @id
      UNION ALL SELECT substr(date,1,7), cost FROM service_records WHERE vehicle_id = @id
      UNION ALL SELECT substr(date,1,7), cost FROM repair_records  WHERE vehicle_id = @id
      UNION ALL SELECT substr(date,1,7), cost FROM upgrade_records WHERE vehicle_id = @id
    ) GROUP BY month ORDER BY month DESC LIMIT 12
  `).all({ id })

  const reminderCounts = { overdue: 0, 'due-soon': 0, upcoming: 0, 'not-due': 0 }
  for (const r of decoratedReminders(db, id, odo)) reminderCounts[r.urgency]++

  res.json({
    odometer: odo,
    total_cost: totalCost,
    cost_breakdown: { fuel: fuelCost, service: serviceCost, repair: repairCost, upgrade: upgradeCost },
    fuel: { fillups: fuelAgg.n, total_quantity: fuelAgg.qty, avg_economy: avgEconomy },
    cost_per_distance: costPerDistance,
    monthly_spend: monthly.reverse(),
    reminders: reminderCounts,
  })
})

export default router
