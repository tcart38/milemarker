import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  Plus, Trash2, Pencil, Paperclip, Gauge, Fuel, Wrench, Bell, LayoutDashboard,
  ArrowUp, ArrowDown, ArrowUpDown, Table2, LineChart, Disc3, ArrowLeft, Repeat,
} from 'lucide-react'
import {
  getVehicle, updateVehicle, deleteVehicle, getDashboard,
  getFuel, createFuel, updateFuel, deleteFuel,
  getRecords, createRecord, updateRecord, deleteRecord, convertRecord,
  getReminders, createReminder, updateReminder, deleteReminder,
  getTires, createTireSet, updateTireSet, deleteTireSet,
  createTireChange, updateTireChange, deleteTireChange, createTread, deleteTread,
  uploadAttachment,
} from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import Modal from '../components/Modal.jsx'
import Combobox from '../components/Combobox.jsx'
import ItemsInput from '../components/ItemsInput.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import AttachmentsModal from '../components/AttachmentsModal.jsx'
import RecordAttachments from '../components/RecordAttachments.jsx'
import TrendChart, { ChartTable } from '../components/TrendChart.jsx'
import { PRESETS } from '../presets.js'
import { vehicleTitle } from '../vehicles.js'

// Upload any staged files against a saved record.
async function uploadPending(vehicleId, recordType, recordId, pending) {
  for (const file of pending) await uploadAttachment(vehicleId, recordType, recordId, file)
}

const RECORD_TYPES = ['service', 'repair', 'upgrade']
const TYPE_LABEL = { service: 'Service', repair: 'Repair', upgrade: 'Upgrade' }

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'fuel', label: 'Fuel', icon: Fuel },
  { key: 'records', label: 'Service', icon: Wrench },
  { key: 'tires', label: 'Tires', icon: Disc3 },
  { key: 'odometer', label: 'Odometer', icon: Gauge },
  { key: 'reminder', label: 'Reminders', icon: Bell },
]

// Older links used one tab per record type; they all live in the merged Service tab now.
const LEGACY_TABS = { service: 'records', repair: 'records', upgrade: 'records' }

const FAB_LABEL = {
  overview: 'Log fuel', fuel: 'Add fuel', records: 'Add record',
  tires: 'Add tire set', odometer: 'Add reading', reminder: 'Add reminder',
}

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString() : '—')
const byRecency = (a, b) =>
  (b.date || '').localeCompare(a.date || '') || (b.odometer ?? -1) - (a.odometer ?? -1) || b.id - a.id


export default function VehicleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setCrumb } = useOutletContext()
  const { money, distance, units } = useSettings()
  const [params, setParams] = useSearchParams()
  const [vehicle, setVehicle] = useState(null)
  const [editing, setEditing] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // EVs track kWh instead of fuel volume; labels follow the vehicle.
  const isEv = !!vehicle?.is_electric
  const vUnits = useMemo(
    () => (isEv ? { ...units, volume: 'kWh', economy: `${units.distance}/kWh` } : units),
    [isEv, units]
  )

  const rawTab = params.get('tab') || 'overview'
  const tab = LEGACY_TABS[rawTab] || (TABS.some((t) => t.key === rawTab) ? rawTab : 'overview')
  const recordsFilter = RECORD_TYPES.includes(rawTab) ? rawTab : 'all'

  const setTab = (key) => {
    const p = new URLSearchParams(params)
    if (key === 'overview') p.delete('tab')
    else p.set('tab', key)
    setParams(p, { replace: true })
  }

  // ?add=1 (garage quick action, PWA shortcut) opens the add form for the linked tab.
  const [pendingAdd, setPendingAdd] = useState(() => params.get('add') === '1')
  const consumeAdd = useCallback(() => setPendingAdd(false), [])
  useEffect(() => {
    if (params.get('add')) {
      const p = new URLSearchParams(params)
      p.delete('add')
      setParams(p, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadVehicle = useCallback(() => { getVehicle(id).then(setVehicle) }, [id])
  useEffect(() => { loadVehicle() }, [loadVehicle])

  // Remembered so the "Log fuel" PWA shortcut can jump straight to this vehicle.
  useEffect(() => { localStorage.setItem('mm.lastVehicleId', id) }, [id])

  // Reflect the current vehicle in the top-bar breadcrumb; clear it on leave.
  useEffect(() => {
    setCrumb(vehicle ? vehicleTitle(vehicle) : null)
    return () => setCrumb(null)
  }, [vehicle, setCrumb])

  if (!vehicle) return <div className="p-6 text-slate-400">Loading…</div>

  const fab = () => {
    if (tab === 'overview') setTab('fuel')
    setPendingAdd(true)
  }

  const tabProps = { pendingAdd, onAddConsumed: consumeAdd }

  return (
    <div className="p-4 sm:p-6 pb-28 sm:pb-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5 min-w-0">
        <h1 className="text-xl font-semibold truncate min-w-0">{vehicleTitle(vehicle)}</h1>
        <span className="badge badge-not-due flex-shrink-0"><Gauge size={12} /> {distance(vehicle.odometer)}</span>
        {!!vehicle.is_archived && (
          <span className="badge badge-due-soon flex-shrink-0">Sold{vehicle.sold_date ? ` ${fmtDate(vehicle.sold_date)}` : ''}</span>
        )}
        <div className="flex-1" />
        <button onClick={() => setShowDocs(true)} className="btn-ghost text-slate-400 flex-shrink-0" title="Photos & documents" aria-label="Photos & documents"><Paperclip size={15} /></button>
        <button onClick={() => setEditing(true)} className="btn-ghost text-slate-400 flex-shrink-0" title="Edit vehicle" aria-label="Edit vehicle"><Pencil size={15} /></button>
      </div>

      {/* All six tabs fit a 375px screen: stacked icon+label on mobile, classic row on desktop. */}
      <div className="-mx-4 sm:mx-0 mb-5 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="grid grid-cols-6 sm:flex sm:gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-0.5 sm:px-3 pt-2 pb-1.5 sm:py-2
                          text-[10px] sm:text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <t.icon size={16} /> {t.key === 'fuel' && isEv ? 'Charging' : t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <Overview
          vehicleId={id} vehicle={vehicle} money={money} distance={distance} units={vUnits}
          onOpenReminders={() => setTab('reminder')}
          onAddReminder={() => { setTab('reminder'); setPendingAdd(true) }}
          onOpenTires={() => setTab('tires')}
          onVehicleChange={loadVehicle}
        />
      )}
      {tab === 'fuel' && <FuelTab vehicleId={id} money={money} units={vUnits} onChange={loadVehicle} {...tabProps} />}
      {tab === 'records' && <RecordsTab vehicleId={id} money={money} onChange={loadVehicle} initialFilter={recordsFilter} {...tabProps} />}
      {tab === 'tires' && <TiresTab vehicleId={id} money={money} distance={distance} units={units} onChange={loadVehicle} {...tabProps} />}
      {tab === 'odometer' && <OdometerTab vehicleId={id} distance={distance} onChange={loadVehicle} {...tabProps} />}
      {tab === 'reminder' && (
        <ReminderTab
          vehicleId={id} distance={distance} currentOdo={vehicle.odometer}
          onOpenTires={() => setTab('tires')}
          onAddTireSet={() => { setTab('tires'); setPendingAdd(true) }}
          {...tabProps}
        />
      )}

      <button className="fab" onClick={fab} aria-label={FAB_LABEL[tab]}>
        <Plus size={18} />
        {isEv && tab === 'overview' ? 'Log charge' : isEv && tab === 'fuel' ? 'Add charge' : FAB_LABEL[tab]}
      </button>

      {showDocs && (
        <AttachmentsModal
          vehicleId={id} recordType="vehicle" recordId={vehicle.id}
          title={`Photos & documents — ${vehicleTitle(vehicle)}`}
          onClose={() => setShowDocs(false)} onChanged={loadVehicle}
        />
      )}

      {editing && (
        <EditVehicleModal
          vehicle={vehicle}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); loadVehicle() }}
          onDelete={() => { setEditing(false); setConfirmDelete(true) }}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete vehicle?"
          onClose={() => setConfirmDelete(false)}
          footer={<>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost">Cancel</button>
            <button onClick={async () => { await deleteVehicle(id); navigate('/garage') }} className="btn-danger flex-1 sm:flex-none">Delete</button>
          </>}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This permanently deletes <strong>{vehicleTitle(vehicle)}</strong> and all its records. This can't be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

/* ---------- Edit vehicle ---------- */

function EditVehicleModal({ vehicle, onClose, onSaved, onDelete }) {
  const { units } = useSettings()
  const [f, setF] = useState({
    name: vehicle.name || '', year: vehicle.year ? String(vehicle.year) : '',
    make: vehicle.make || '', model: vehicle.model || '', license_plate: vehicle.license_plate || '',
    purchase_date: vehicle.purchase_date || '',
    purchase_price: vehicle.purchase_price != null ? String(vehicle.purchase_price) : '',
    notes: vehicle.notes || '',
    is_electric: !!vehicle.is_electric,
  })
  const [selling, setSelling] = useState(false)
  const [soldDate, setSoldDate] = useState(vehicle.sold_date || today())
  const [soldPrice, setSoldPrice] = useState(vehicle.sold_price != null ? String(vehicle.sold_price) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const patch = async (body) => {
    setSaving(true); setError(null)
    try { await updateVehicle(vehicle.id, body); onSaved() }
    catch (err) { setError(err.message); setSaving(false) }
  }

  const save = () => patch({
    name: f.name.trim() || null,
    year: f.year ? parseInt(f.year, 10) : null,
    make: f.make.trim() || null,
    model: f.model.trim() || null,
    license_plate: f.license_plate.trim() || null,
    purchase_date: f.purchase_date || null,
    purchase_price: f.purchase_price ? parseFloat(f.purchase_price) : null,
    notes: f.notes.trim() || null,
    is_electric: f.is_electric,
  })

  return (
    <Modal title="Edit vehicle" onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Year</label><input value={f.year} onChange={set('year')} inputMode="numeric" className="input" /></div>
        <div className="col-span-2"><label className="label">Make</label><input value={f.make} onChange={set('make')} className="input" /></div>
      </div>
      <div><label className="label">Model</label><input value={f.model} onChange={set('model')} className="input" /></div>
      <div><label className="label">Nickname (optional)</label><input value={f.name} onChange={set('name')} className="input" /></div>
      <div><label className="label">License plate (optional)</label><input value={f.license_plate} onChange={set('license_plate')} className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Purchased on</label><input type="date" value={f.purchase_date} onChange={set('purchase_date')} className="input" /></div>
        <div><label className="label">Purchase price</label><input value={f.purchase_price} onChange={set('purchase_price')} inputMode="decimal" className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm py-1">
        <input type="checkbox" checked={f.is_electric} onChange={(e) => setF((s) => ({ ...s, is_electric: e.target.checked }))} className="accent-brand w-4 h-4" />
        Electric vehicle
        <span className="text-xs text-slate-400">— charges in kWh, efficiency in {units.distance}/kWh</span>
      </label>
      <div>
        <label className="label">Notes</label>
        <textarea value={f.notes} onChange={set('notes')} rows={3} className="input resize-y"
          placeholder="Tire pressures, oil spec, wiper sizes…" />
      </div>

      {/* Ownership — selling and deleting live together, away from the everyday fields. */}
      <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3 space-y-3">
        {vehicle.is_archived ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-due-soon">Sold{vehicle.sold_date ? ` ${fmtDate(vehicle.sold_date)}` : ''}</span>
            <button type="button" onClick={() => patch({ is_archived: false, sold_date: null, sold_price: null })} className="btn-ghost text-xs">
              Mark as active
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onDelete} className="btn-ghost text-xs text-red-500 hover:text-red-500">
              <Trash2 size={13} /> Delete…
            </button>
          </div>
        ) : selling ? (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sold on</label>
                <input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Sale price (optional)</label>
                <input value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} inputMode="decimal" className="input" />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button"
                onClick={() => patch({ is_archived: true, sold_date: soldDate || null, sold_price: soldPrice ? parseFloat(soldPrice) : null })}
                className="btn-primary">
                Confirm sale
              </button>
              <button type="button" onClick={() => setSelling(false)} className="btn-ghost">Cancel</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Sold vehicles move to their own section in the garage — all history stays.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelling(true)} className="btn-ghost text-xs text-amber-500 hover:text-amber-500">
              Mark as sold…
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onDelete} className="btn-ghost text-xs text-red-500 hover:text-red-500">
              <Trash2 size={13} /> Delete…
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

/* ---------- Overview ---------- */

function Stat({ label, value }) {
  return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
}

/* Reminder progress toward due — worst of the mileage and calendar constraints. */

const URGENCY_RANK = { overdue: 0, 'due-soon': 1, upcoming: 2, 'not-due': 3 }
const URGENCY_BAR = {
  overdue: 'bg-red-500', 'due-soon': 'bg-amber-500',
  upcoming: 'bg-blue-500', 'not-due': 'bg-emerald-500',
}

function reminderProgress(r, currentOdo) {
  const ps = []
  if (r.due_odometer != null && r.interval_miles && currentOdo != null) {
    ps.push(1 - (r.due_odometer - currentOdo) / r.interval_miles)
  }
  if (r.due_date && r.interval_months) {
    const daysLeft = (new Date(r.due_date + 'T00:00:00') - Date.now()) / 86400000
    ps.push(1 - daysLeft / (r.interval_months * 30.44))
  }
  if (ps.length === 0) return null
  return Math.max(0, Math.min(1, Math.max(...ps)))
}

function reminderStatus(r, currentOdo, u) {
  if (!r.has_baseline) return 'no history yet'
  const miles = r.due_odometer != null && currentOdo != null ? r.due_odometer - currentOdo : null
  const days = r.due_date ? Math.ceil((new Date(r.due_date + 'T00:00:00') - Date.now()) / 86400000) : null
  if (r.urgency === 'overdue') {
    if (miles != null && miles < 0) return `${Math.abs(miles).toLocaleString()} ${u.distance} overdue`
    if (days != null && days < 0) return `${Math.abs(days)} days overdue`
    return 'overdue'
  }
  const parts = []
  if (miles != null) parts.push(`${miles.toLocaleString()} ${u.distance} left`)
  if (days != null) parts.push(days <= 60 ? `${days} days left` : `by ${fmtDate(r.due_date)}`)
  return parts.join(' · ') || '—'
}

function reminderStatusClass(r) {
  if (!r.has_baseline) return 'text-amber-500'
  if (r.urgency === 'overdue') return 'text-red-500 font-medium'
  if (r.urgency === 'due-soon') return 'text-amber-500 font-medium'
  return 'text-slate-500 dark:text-slate-400'
}

function ReminderProgressBar({ r, progress }) {
  if (progress == null) return null
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
      <div
        className={`h-full rounded-full ${URGENCY_BAR[r.urgency] || 'bg-slate-400'}`}
        style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
      />
    </div>
  )
}

function ReminderRow({ r, currentOdo, onClick }) {
  const { units } = useSettings()
  const progress = r.has_baseline ? reminderProgress(r, currentOdo) : null
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium truncate min-w-0">{r.description}</span>
        <span className={`text-xs flex-shrink-0 tabular-nums ${reminderStatusClass(r)}`}>
          {reminderStatus(r, currentOdo, units)}
        </span>
      </div>
      <ReminderProgressBar r={r} progress={progress} />
    </button>
  )
}

const METRICS = [
  { key: 'economy', label: 'Fuel economy', type: 'line' },
  { key: 'miles', label: 'Distance driven', type: 'bar' },
  { key: 'spend', label: 'Spend', type: 'bar' },
  { key: 'price', label: 'Fuel price', type: 'line' },
]
const TREND_RANGES = [
  { key: '6m', label: '6M', months: 6 },
  { key: '1y', label: '1Y', months: 12 },
  { key: 'all', label: 'All', months: null },
]

const fmtChartX = (x) => {
  if (x.length === 7) {
    const d = new Date(x + '-02T00:00:00')
    const s = d.toLocaleDateString(undefined, { month: 'short' })
    return d.getMonth() === 0 ? `${s} ${String(d.getFullYear()).slice(2)}` : s
  }
  return new Date(x + 'T00:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
}

// Fixed color per metric (validated categorical palette, light + dark surfaces).
// Literal class names — Tailwind's scanner must see them.
const METRIC_COLORS = {
  economy: { stroke: 'stroke-brand', fill: 'fill-brand', fillHover: 'fill-brand-hover', dot: 'bg-brand' },
  miles:   { stroke: 'stroke-emerald-600', fill: 'fill-emerald-600', fillHover: 'fill-emerald-500', dot: 'bg-emerald-600' },
  spend:   { stroke: 'stroke-amber-600', fill: 'fill-amber-600', fillHover: 'fill-amber-500', dot: 'bg-amber-600' },
  price:   { stroke: 'stroke-rose-600', fill: 'fill-rose-600', fillHover: 'fill-rose-500', dot: 'bg-rose-600' },
}

function TrendCard({ fuel, odo, monthlySpend, money, units }) {
  const { settings } = useSettings()
  const isEv = units.volume === 'kWh'
  // Multi-select: each chosen metric gets its own stacked panel. Different units
  // never share one axis — small multiples instead of a dual-axis chart.
  const [selected, setSelected] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mm.trendMetrics') || 'null')
      if (Array.isArray(saved)) {
        const valid = saved.filter((k) => METRICS.some((m) => m.key === k))
        if (valid.length) return valid
      }
    } catch { /* fall through */ }
    const legacy = localStorage.getItem('mm.trendMetric')
    return METRICS.some((m) => m.key === legacy) ? [legacy] : ['economy']
  })
  const [range, setRange] = useState(() => {
    const r = localStorage.getItem('mm.trendRange')
    return TREND_RANGES.some((x) => x.key === r) ? r : '1y'
  })
  const [showTable, setShowTable] = useState(false)
  useEffect(() => { localStorage.setItem('mm.trendMetrics', JSON.stringify(selected)) }, [selected])
  useEffect(() => { localStorage.setItem('mm.trendRange', range) }, [range])

  const toggleMetric = (key) => setSelected((sel) =>
    sel.includes(key)
      ? (sel.length > 1 ? sel.filter((k) => k !== key) : sel) // at least one stays on
      : [...sel, key])

  const allSeries = useMemo(() => {
    const byDateAsc = [...fuel].sort((a, b) => a.date.localeCompare(b.date))
    const economy = byDateAsc.filter((r) => r.economy != null).map((r) => ({ x: r.date, y: r.economy }))
    const price = byDateAsc.filter((r) => r.quantity > 0).map((r) => ({ x: r.date, y: r.cost / r.quantity }))

    // Miles per month: highest odometer seen each month, differenced across months.
    const maxByMonth = new Map()
    for (const r of [...fuel, ...odo]) {
      if (r.odometer == null || !r.date) continue
      const m = r.date.slice(0, 7)
      maxByMonth.set(m, Math.max(maxByMonth.get(m) ?? 0, r.odometer))
    }
    const months = [...maxByMonth.keys()].sort()
    const miles = []
    for (let i = 1; i < months.length; i++) {
      const diff = maxByMonth.get(months[i]) - maxByMonth.get(months[i - 1])
      if (diff >= 0) miles.push({ x: months[i], y: diff })
    }

    const spend = [...monthlySpend].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ x: m.month, y: m.cost }))
    return { economy, price, miles, spend }
  }, [fuel, odo, monthlySpend])

  const cutoff = useMemo(() => {
    const r = TREND_RANGES.find((x) => x.key === range)
    if (!r?.months) return null
    const d = new Date()
    d.setMonth(d.getMonth() - r.months)
    return d.toISOString().slice(0, 10)
  }, [range])

  const seriesFor = (key) => {
    const s = allSeries[key]
    return cutoff ? s.filter((p) => p.x >= cutoff.slice(0, p.x.length)) : s
  }

  const cur = settings.currency_symbol
  const FORMATS = {
    economy: { value: (v) => `${v.toFixed(1)} ${units.economy}`, tick: (v) => `${v}`, header: 'Economy' },
    miles: { value: (v) => `${Math.round(v).toLocaleString()} ${units.distance}`, tick: (v) => (v >= 1000 ? `${v / 1000}k` : `${v}`), header: 'Distance' },
    spend: { value: (v) => money(v), tick: (v) => `${cur}${Math.round(v).toLocaleString()}`, header: 'Spend' },
    price: { value: (v) => `${cur}${(v).toFixed(2)}/${units.volume}`, tick: (v) => `${cur}${v.toFixed(2)}`, header: 'Price' },
  }
  const shownMetrics = METRICS.filter((m) => selected.includes(m.key))
  const single = shownMetrics.length === 1

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="stat-label !mb-0">Trends</p>
        <div className="flex-1" />
        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-700/40 p-0.5">
          {TREND_RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                range === r.key ? 'bg-white dark:bg-slate-800 text-brand shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowTable((s) => !s)} className="btn-ghost p-1.5"
          title={showTable ? 'Show chart' : 'Show table'} aria-label={showTable ? 'Show chart' : 'Show table'}>
          {showTable ? <LineChart size={15} /> : <Table2 size={15} />}
        </button>
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {METRICS.map((m) => {
          const on = selected.includes(m.key)
          const label = isEv && m.key === 'economy' ? 'Efficiency' : isEv && m.key === 'price' ? 'Energy price' : m.label
          return (
            <button key={m.key} onClick={() => toggleMetric(m.key)} aria-pressed={on}
              className={`chip gap-1.5 ${on ? 'chip-on' : 'chip-off'}`}>
              <span className={`w-2 h-2 rounded-full ${METRIC_COLORS[m.key].dot} ${on ? '' : 'opacity-40'}`} />
              {label}
            </button>
          )
        })}
      </div>

      <div className="space-y-4">
        {shownMetrics.map((m) => {
          const s = seriesFor(m.key)
          const fmt = FORMATS[m.key]
          return (
            <div key={m.key}>
              {!single && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${METRIC_COLORS[m.key].dot}`} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {isEv && m.key === 'economy' ? 'Efficiency' : isEv && m.key === 'price' ? 'Energy price' : m.label}
                  </span>
                  {s.length > 0 && (
                    <span className="text-xs text-slate-400 tabular-nums ml-auto">{fmt.value(s[s.length - 1].y)}</span>
                  )}
                </div>
              )}
              {s.length === 0 ? (
                <p className={`text-sm text-slate-400 text-center ${single ? 'py-10' : 'py-4'}`}>
                  {m.key === 'economy'
                    ? 'No economy data in this range yet — it needs consecutive fill-to-full records.'
                    : m.key === 'miles'
                      ? 'Distance is measured month over month — it needs odometer readings (from any record) in two different months.'
                      : 'No data in this range yet.'}
                </p>
              ) : showTable ? (
                <ChartTable data={s} xHeader={s[0].x.length === 7 ? 'Month' : 'Date'} yHeader={fmt.header}
                  formatValue={fmt.value} formatX={fmtChartX} />
              ) : (
                <TrendChart
                  data={s} type={m.type} height={single ? 208 : 132} color={METRIC_COLORS[m.key]}
                  formatValue={fmt.value} formatTick={fmt.tick} formatX={fmtChartX}
                  ariaLabel={`${m.label} over time`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NotesCard({ vehicle, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const areaRef = useRef(null)

  const start = () => { setDraft(vehicle.notes || ''); setEditing(true); setError(null) }
  useEffect(() => { if (editing) areaRef.current?.focus() }, [editing])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await updateVehicle(vehicle.id, { notes: draft.trim() || null })
      setEditing(false)
      onChanged?.()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (!editing && !vehicle.notes) {
    return (
      <button onClick={start} className="btn-ghost text-xs -my-1">
        <Plus size={13} /> Add notes
      </button>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <p className="stat-label !mb-0">Notes</p>
        <div className="flex-1" />
        {!editing && (
          <button onClick={start} className="btn-ghost p-1.5 -my-1" title="Edit notes" aria-label="Edit notes">
            <Pencil size={13} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={areaRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            className="input resize-y" placeholder="Tire pressures, oil spec, wiper sizes…"
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary text-xs disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancel</button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{vehicle.notes}</p>
      )}
    </div>
  )
}

function Overview({ vehicleId, vehicle, money, distance, units, onOpenReminders, onAddReminder, onOpenTires, onVehicleChange }) {
  const isEv = units.volume === 'kWh'
  const [data, setData] = useState(null)
  const [reminders, setReminders] = useState([])
  const [fuel, setFuel] = useState(null)
  const [odo, setOdo] = useState(null)
  const [tires, setTires] = useState(null)
  useEffect(() => { getDashboard(vehicleId).then(setData) }, [vehicleId])
  useEffect(() => { getReminders(vehicleId).then(setReminders) }, [vehicleId])
  useEffect(() => { getTires(vehicleId).then(setTires).catch(() => setTires(null)) }, [vehicleId])
  useEffect(() => { getFuel(vehicleId).then(setFuel) }, [vehicleId])
  // Every record type can carry an odometer reading — the distance-driven trend
  // uses them all, not just dedicated odometer entries.
  useEffect(() => {
    Promise.all(['odometer', 'service', 'repair', 'upgrade'].map((t) => getRecords(vehicleId, t)))
      .then((groups) => setOdo(
        groups.flat()
          .filter((r) => r.odometer != null && r.date)
          .map((r) => ({ date: r.date, odometer: r.odometer }))
      ))
  }, [vehicleId])

  const fuelStats = useMemo(() => {
    if (!fuel || fuel.length === 0) return null
    const eco = fuel.filter((r) => r.economy != null).map((r) => r.economy)
    const priced = fuel.filter((r) => r.quantity > 0)
    const totalQty = priced.reduce((s, r) => s + r.quantity, 0)
    const totalCost = priced.reduce((s, r) => s + r.cost, 0)
    return {
      count: fuel.length,
      avgPrice: totalQty ? totalCost / totalQty : null,
      best: eco.length ? Math.max(...eco) : null,
      worst: eco.length ? Math.min(...eco) : null,
    }
  }, [fuel])

  if (!data || !fuel || !odo) return <div className="text-slate-400 text-sm">Loading…</div>

  const b = data.cost_breakdown
  const topReminders = [...reminders]
    .sort((a, x) =>
      (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[x.urgency] ?? 9) ||
      (reminderProgress(x, data.odometer) ?? -1) - (reminderProgress(a, data.odometer) ?? -1)
    )
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Odometer" value={distance(data.odometer)} />
        <Stat label="Total spent" value={money(data.total_cost)} />
        <Stat label="Avg economy" value={data.fuel.avg_economy ? `${data.fuel.avg_economy} ${units.economy}` : '—'} />
        <Stat label={`Cost / ${units.distance}`} value={data.cost_per_distance != null ? money(data.cost_per_distance) : '—'} />
      </div>

      {/* Reminders — always shown here so upcoming maintenance is front and centre */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={15} className="text-slate-400" />
          <p className="stat-label !mb-0">Reminders</p>
          <div className="flex-1" />
          <button onClick={onAddReminder} className="btn-ghost p-1.5 -my-1" title="Add reminder" aria-label="Add reminder">
            <Plus size={14} />
          </button>
        </div>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-400 pb-1">
            No reminders yet —{' '}
            <button onClick={onAddReminder} className="text-brand hover:underline">add one</button>.
          </p>
        ) : (
          <div className="space-y-0.5">
            {topReminders.map((r) => (
              <ReminderRow key={r.id} r={r} currentOdo={data.odometer} onClick={onOpenReminders} />
            ))}
            {reminders.length > topReminders.length && (
              <button onClick={onOpenReminders} className="text-xs text-brand hover:underline px-2 pt-1">
                View all {reminders.length} reminders
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tires — only once there's a set to talk about. */}
      {tires && tires.sets.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Disc3 size={15} className="text-slate-400" />
            <p className="stat-label !mb-0">Tires</p>
            <div className="flex-1" />
            <button onClick={onOpenTires} className="text-xs text-brand hover:underline">Manage</button>
          </div>
          <div className="space-y-0.5">
            {[...tires.sets].sort((a, b) => (b.is_mounted ? 1 : 0) - (a.is_mounted ? 1 : 0)).map((s) => {
              const rot = rotationStatus(s, units)
              return (
                <button key={s.id} onClick={onOpenTires}
                  className="w-full text-left px-2 py-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium truncate min-w-0">
                      {s.name}
                      {s.is_mounted && <span className="badge badge-service ml-1.5 font-normal">on the car</span>}
                    </span>
                    <span className="text-xs flex-shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {s.miles.toLocaleString()} {units.distance}
                    </span>
                  </div>
                  <WearBar pct={s.wear_pct} />
                  {rot && rot.pct != null && rot.pct >= 0.85 && (
                    <p className={`text-[11px] mt-1 tabular-nums ${rot.cls}`}>{rot.text}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <TrendCard fuel={fuel} odo={odo} monthlySpend={data.monthly_spend} money={money} units={units} />

      <NotesCard vehicle={vehicle} onChanged={onVehicleChange} />

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="stat-label mb-3">Cost breakdown</p>
          {['fuel', 'service', 'repair', 'upgrade'].map((k) => (
            <div key={k} className="flex items-center justify-between py-1 text-sm">
              <span className="capitalize text-slate-600 dark:text-slate-300">{k}</span>
              <span className="tabular-nums">{money(b[k])}</span>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <p className="stat-label mb-3">{isEv ? 'Charging stats' : 'Fuel stats'}</p>
          {!fuelStats ? (
            <p className="text-sm text-slate-400">{isEv ? 'No charges logged yet.' : 'No fill-ups logged yet.'}</p>
          ) : (
            <>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{isEv ? 'Charges logged' : 'Fill-ups logged'}</span>
                <span className="tabular-nums">{fuelStats.count}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Avg {isEv ? 'energy' : 'fuel'} price</span>
                <span className="tabular-nums">{fuelStats.avgPrice != null ? `${money(fuelStats.avgPrice)}/${units.volume}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Best economy</span>
                <span className="tabular-nums">{fuelStats.best != null ? `${fuelStats.best.toFixed(1)} ${units.economy}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Worst economy</span>
                <span className="tabular-nums">{fuelStats.worst != null ? `${fuelStats.worst.toFixed(1)} ${units.economy}` : '—'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {!!(vehicle?.purchase_price != null || vehicle?.purchase_date || vehicle?.is_archived) && (
        <div className="card p-4">
          <p className="stat-label mb-3">Ownership</p>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Purchased</span>
            <span className="tabular-nums">
              {vehicle.purchase_date ? fmtDate(vehicle.purchase_date) : '—'}
              {vehicle.purchase_price != null && ` · ${money(vehicle.purchase_price)}`}
            </span>
          </div>
          {!!vehicle.is_archived && (
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Sold</span>
              <span className="tabular-nums">
                {vehicle.sold_date ? fmtDate(vehicle.sold_date) : '—'}
                {vehicle.sold_price != null && ` · ${money(vehicle.sold_price)}`}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Running costs</span>
            <span className="tabular-nums">{money(data.total_cost)}</span>
          </div>
          {vehicle.purchase_price != null && (
            <div className="flex items-center justify-between py-1 text-sm border-t border-slate-100 dark:border-white/[0.04] mt-1 pt-2">
              <span className="text-slate-600 dark:text-slate-300 font-medium">All-in cost</span>
              <span className="tabular-nums font-medium">
                {money(vehicle.purchase_price + data.total_cost - (vehicle.sold_price ?? 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Shared bits ---------- */

function TabShell({ title, addLabel = 'Add', onAdd, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
        {/* The mobile FAB covers this action on small screens. */}
        <button onClick={onAdd} className="btn-primary text-xs hidden sm:inline-flex"><Plus size={14} /> {addLabel}</button>
      </div>
      {children}
    </div>
  )
}

function RowActions({ onEdit, onDelete, attachCount, onAttach, compact = false }) {
  const pad = compact ? 'p-1.5' : 'p-2'
  const iconSize = compact ? 14 : 16
  return (
    <div className="flex items-center justify-end gap-1">
      {onAttach && (
        <button onClick={onAttach} className={`relative text-slate-400 hover:text-brand ${pad}`} title="Receipts & documents" aria-label="Receipts & documents">
          <Paperclip size={iconSize - 1} className={attachCount > 0 ? 'text-brand' : ''} />
          {attachCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-brand text-white text-[9px] leading-none rounded-full min-w-[13px] h-[13px] flex items-center justify-center px-0.5">{attachCount}</span>
          )}
        </button>
      )}
      <button onClick={onEdit} className={`text-slate-400 hover:text-brand ${pad}`} title="Edit" aria-label="Edit"><Pencil size={iconSize - 1} /></button>
      <button onClick={onDelete} className={`text-slate-400 hover:text-red-500 ${pad}`} title="Delete" aria-label="Delete"><Trash2 size={iconSize} /></button>
    </div>
  )
}

function EmptyRow({ colSpan, label }) {
  return <tr><td colSpan={colSpan} className="py-8 text-center text-sm text-slate-400">{label}</td></tr>
}

/* Column sorting — local per tab, so every page opens on date, newest first. */

function useSort(defaultKey = 'date') {
  const [sort, setSort] = useState({ key: defaultKey, dir: 'desc' })
  const sortBy = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  return { sort, sortBy, setSort }
}

function applySort(rows, { key, dir }) {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = a[key], vb = b[key]
    const na = va == null || va === '', nb = vb == null || vb === ''
    if (na && nb) return byRecency(a, b)
    if (na) return 1 // empty values always sink to the bottom
    if (nb) return -1
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
    return c !== 0 ? c * m : byRecency(a, b)
  })
}

function Th({ label, k, sort, onSort }) {
  const active = sort.key === k
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="px-3 py-1">
      <button
        onClick={() => onSort(k)}
        className={`group flex items-center gap-1 py-1 uppercase tracking-wider text-[11px] font-medium transition-colors ${
          active ? 'text-brand' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
        }`}
      >
        {label} <Icon size={11} className={active ? '' : 'opacity-0 group-hover:opacity-60 transition-opacity'} />
      </button>
    </th>
  )
}

// Mobile counterpart of the sortable headers, shown above the card lists.
function MobileSortBar({ columns, sort, setSort }) {
  return (
    <div className="sm:hidden flex items-center justify-end gap-0.5 mb-2 text-xs text-slate-500 dark:text-slate-400">
      <label htmlFor="mobile-sort" className="text-[11px] text-slate-400">Sort</label>
      <select
        id="mobile-sort"
        value={sort.key}
        onChange={(e) => setSort((s) => ({ ...s, key: e.target.value }))}
        className="bg-transparent text-xs font-medium focus:outline-none py-1.5"
      >
        {columns.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
      </select>
      <button
        onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))}
        className="p-1.5"
        title={sort.dir === 'desc' ? 'Descending — tap for ascending' : 'Ascending — tap for descending'}
        aria-label={sort.dir === 'desc' ? 'Sorted descending, switch to ascending' : 'Sorted ascending, switch to descending'}
      >
        {sort.dir === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
      </button>
    </div>
  )
}

function EmptyCard({ label, actionLabel, onAction }) {
  return (
    <div className="card p-8 text-center text-sm text-slate-400">
      <p>{label}</p>
      {onAction && <button onClick={onAction} className="btn-primary text-xs mt-3"><Plus size={13} /> {actionLabel}</button>}
    </div>
  )
}

function useRecords(loader, deps) {
  const [rows, setRows] = useState([])
  const reload = useCallback(() => { loader().then(setRows) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [reload])
  return { rows, reload }
}

// Open the add-form when the page-level FAB / quick link asks for it.
function usePendingAdd(pendingAdd, onAddConsumed, open) {
  useEffect(() => {
    if (pendingAdd) { open(); onAddConsumed() }
  }, [pendingAdd, onAddConsumed]) // eslint-disable-line react-hooks/exhaustive-deps
}

function FormFooter({ onClose, onSave, saving }) {
  return <>
    <button onClick={onClose} className="btn-ghost">Cancel</button>
    <button onClick={onSave} disabled={saving} className="btn-primary flex-1 sm:flex-none disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
  </>
}

/* ---------- Fuel ---------- */

const FUEL_COLUMNS = [
  { k: 'date', label: 'Date' },
  { k: 'odometer', label: 'Odometer' },
  { k: 'quantity', label: 'Qty' },
  { k: 'cost', label: 'Cost' },
  { k: 'price', label: 'price' }, // label filled in per volume unit
  { k: 'economy', label: 'Economy' },
]

function FuelTab({ vehicleId, money, units, onChange, pendingAdd, onAddConsumed }) {
  const { distance, settings } = useSettings()
  const isEv = units.volume === 'kWh'
  const fuelColumns = useMemo(
    () => FUEL_COLUMNS.map((c) => (c.k === 'price' ? { ...c, label: `${settings.currency_symbol}/${units.volume}` } : c)),
    [settings.currency_symbol, units.volume]
  )
  const { rows, reload } = useRecords(
    () => getFuel(vehicleId).then((rs) => rs.map((r) => ({ ...r, price: r.quantity > 0 ? r.cost / r.quantity : null }))),
    [vehicleId]
  )
  const { sort, sortBy, setSort } = useSort()
  const sorted = useMemo(() => applySort(rows, sort), [rows, sort])
  const [form, setForm] = useState(null) // null | {} (add) | record (edit)
  const [attach, setAttach] = useState(null)
  usePendingAdd(pendingAdd, onAddConsumed, () => setForm((f) => f ?? {}))
  const [toDelete, setToDelete] = useState(null)
  const del = async (rid) => { await deleteFuel(vehicleId, rid); reload(); onChange?.() }
  const lastFillup = rows[0] || null

  return (
    <TabShell title={isEv ? 'Charging' : 'Fuel'} addLabel={isEv ? 'Add charge' : 'Add fuel'} onAdd={() => setForm({})}>
      {rows.length > 0 && <MobileSortBar columns={fuelColumns} sort={sort} setSort={setSort} />}
      {/* Mobile: card list with touch-sized actions */}
      <div className="sm:hidden space-y-2">
        {sorted.length === 0 ? (
          <EmptyCard label={isEv ? 'No charges yet.' : 'No fill-ups yet.'} actionLabel={isEv ? 'Add your first charge' : 'Add your first fill-up'} onAction={() => setForm({})} />
        ) : sorted.map((r) => (
          <div key={r.id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{fmtDate(r.date)}</span>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">{money(r.cost)}</div>
                {r.price != null && <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{money(r.price)}/{units.volume}</div>}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums min-w-0 truncate">
                {distance(r.odometer)} · {r.quantity} {units.volume}{!r.is_fill_to_full && ' (partial)'}
                {r.economy ? ` · ${r.economy} ${units.economy}` : ''}
              </p>
              <RowActions attachCount={r.attachment_count} onAttach={() => setAttach(r)} onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="card overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-white/[0.06]">
              {fuelColumns.map((c) => <Th key={c.k} label={c.label} k={c.k} sort={sort} onSort={sortBy} />)}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? <EmptyRow colSpan={7} label="No fuel records yet." /> : sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2 tabular-nums">{r.odometer.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">{r.quantity}{!r.is_fill_to_full && <span className="text-slate-400"> (partial)</span>}</td>
                <td className="px-3 py-2 tabular-nums">{money(r.cost)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{r.price != null ? money(r.price) : '—'}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{r.economy ? `${r.economy} ${units.economy}` : '—'}</td>
                <td className="px-3 py-2"><RowActions compact attachCount={r.attachment_count} onAttach={() => setAttach(r)} onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <FuelForm vehicleId={vehicleId} record={form.id ? form : null} lastFillup={lastFillup} units={units}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); onChange?.() }} />
      )}
      {attach && (
        <AttachmentsModal vehicleId={vehicleId} recordType="fuel" recordId={attach.id}
          title={`Receipts — ${fmtDate(attach.date)} fuel`} onClose={() => setAttach(null)} onChanged={reload} />
      )}
      {toDelete && (
        <ConfirmDialog
          message={`Delete the ${fmtDate(toDelete.date)} ${isEv ? 'charge' : 'fill-up'} (${money(toDelete.cost)})?`}
          onConfirm={async () => { await del(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </TabShell>
  )
}

function FuelForm({ vehicleId, record, lastFillup, units, onClose, onSaved }) {
  const { money } = useSettings()
  const isEv = units.volume === 'kWh'
  const [f, setF] = useState(() => record ? {
    date: record.date, odometer: String(record.odometer), quantity: String(record.quantity), cost: String(record.cost),
    is_fill_to_full: !!record.is_fill_to_full, missed_fuelup: !!record.missed_fuelup, notes: record.notes || '',
  } : { date: today(), odometer: '', quantity: '', cost: '', is_fill_to_full: true, missed_fuelup: false, notes: '' })
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const odoRef = useRef(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggle = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.checked }))

  // Odometer is the first thing to type on a fresh fill-up — focus it immediately.
  useEffect(() => { if (!record) odoRef.current?.focus() }, [record])

  const qty = parseFloat(f.quantity)
  const cost = parseFloat(f.cost)

  const save = async () => {
    if (!f.odometer || !f.quantity || !f.cost) { setError('Odometer, quantity and cost are required.'); return }
    setSaving(true); setError(null)
    const body = {
      date: f.date, odometer: parseInt(f.odometer, 10), quantity: parseFloat(f.quantity), cost: parseFloat(f.cost),
      is_fill_to_full: f.is_fill_to_full, missed_fuelup: f.missed_fuelup, notes: f.notes,
    }
    try {
      const saved = record ? await updateFuel(vehicleId, record.id, body) : await createFuel(vehicleId, body)
      await uploadPending(vehicleId, 'fuel', record ? record.id : saved.id, pending)
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={record ? (isEv ? 'Edit charge' : 'Edit fuel') : (isEv ? 'Add charge' : 'Add fuel')} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Odometer</label>
          <input ref={odoRef} value={f.odometer} onChange={set('odometer')} inputMode="numeric" className="input"
            placeholder={lastFillup ? String(lastFillup.odometer) : ''} />
          {!record && lastFillup && (
            <p className="text-[11px] text-slate-400 mt-1">Last: {lastFillup.odometer.toLocaleString()} on {fmtDate(lastFillup.date)}</p>
          )}
        </div>
        <div>
          <label className="label">Quantity</label>
          <input value={f.quantity} onChange={set('quantity')} inputMode="decimal" className="input" placeholder={units.volume} />
        </div>
      </div>
      <div>
        <label className="label">Total cost</label>
        <input value={f.cost} onChange={set('cost')} inputMode="decimal" className="input" />
        {qty > 0 && cost > 0 && (
          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">≈ {money(cost / qty)} / {units.volume}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={f.is_fill_to_full} onChange={toggle('is_fill_to_full')} className="accent-brand w-4 h-4" /> {isEv ? 'Charged to 100%' : 'Filled to full'}</label>
      <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={f.missed_fuelup} onChange={toggle('missed_fuelup')} className="accent-brand w-4 h-4" /> {isEv ? 'Missed a previous charge' : 'Missed a previous fill-up'}</label>
      <div><label className="label">Date</label><input type="date" value={f.date} onChange={set('date')} className="input" /></div>
      <div><label className="label">Notes</label><input value={f.notes} onChange={set('notes')} className="input" /></div>
      <RecordAttachments vehicleId={vehicleId} recordType="fuel" recordId={record?.id} pending={pending} setPending={setPending} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

/* ---------- Service / Repair / Upgrade (merged) ---------- */

const RECORD_COLUMNS = [
  { k: 'date', label: 'Date' },
  { k: 'type', label: 'Type' },
  { k: 'odometer', label: 'Odometer' },
  { k: 'description', label: 'Items' },
  { k: 'cost', label: 'Cost' },
]

function RecordsTab({ vehicleId, money, onChange, initialFilter = 'all', pendingAdd, onAddConsumed }) {
  const { rows, reload } = useRecords(
    () => Promise.all(
      RECORD_TYPES.map((t) => getRecords(vehicleId, t).then((rs) => rs.map((r) => ({ ...r, type: t }))))
    ).then((groups) => groups.flat().sort(byRecency)),
    [vehicleId]
  )
  const { sort, sortBy, setSort } = useSort()
  const [filter, setFilter] = useState(initialFilter)
  const [form, setForm] = useState(null) // null | { type } (add) | record with .type (edit)
  const [attach, setAttach] = useState(null)
  const defaultType = filter === 'all' ? 'service' : filter

  // Names for the tire-set tags shown on rows; a save can mint a new set.
  const [tireNames, setTireNames] = useState({})
  const loadTires = useCallback(() => {
    getTires(vehicleId)
      .then((t) => setTireNames(Object.fromEntries(t.sets.map((s) => [s.id, s.name]))))
      .catch(() => { /* tires are optional decoration here */ })
  }, [vehicleId])
  useEffect(() => { loadTires() }, [loadTires])
  usePendingAdd(pendingAdd, onAddConsumed, () => setForm((f) => f ?? { type: defaultType }))
  const [toDelete, setToDelete] = useState(null)
  const del = async (r) => { await deleteRecord(vehicleId, r.type, r.id); reload(); onChange?.() }

  const shown = useMemo(
    () => applySort(filter === 'all' ? rows : rows.filter((r) => r.type === filter), sort),
    [rows, filter, sort]
  )

  return (
    <TabShell title="Service, repairs & upgrades" addLabel="Add record" onAdd={() => setForm({ type: defaultType })}>
      <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {['all', ...RECORD_TYPES].map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`chip ${filter === t ? 'chip-on' : 'chip-off'}`}>
            {t === 'all' ? 'All' : `${TYPE_LABEL[t]}s`}
          </button>
        ))}
      </div>

      {rows.length > 0 && <MobileSortBar columns={RECORD_COLUMNS} sort={sort} setSort={setSort} />}
      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {shown.length === 0 ? (
          <EmptyCard label="Nothing logged here yet." actionLabel="Add a record" onAction={() => setForm({ type: defaultType })} />
        ) : shown.map((r) => (
          <div key={`${r.type}-${r.id}`} className="card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium min-w-0 truncate">
                {r.description}
                {tireNames[r.tire_set_id] && <span className="badge badge-not-due ml-1.5 font-normal">{tireNames[r.tire_set_id]}</span>}
              </p>
              <span className="text-sm font-semibold tabular-nums flex-shrink-0">{money(r.cost)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums min-w-0 truncate flex items-center gap-1.5">
                <span className={`badge badge-${r.type}`}>{TYPE_LABEL[r.type]}</span>
                {fmtDate(r.date)}{r.odometer != null && ` · ${r.odometer.toLocaleString()}`}
              </p>
              <RowActions attachCount={r.attachment_count} onAttach={() => setAttach(r)} onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="card overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-white/[0.06]">
              {RECORD_COLUMNS.map((c) => <Th key={c.k} label={c.label} k={c.k} sort={sort} onSort={sortBy} />)}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <EmptyRow colSpan={6} label="Nothing logged here yet." /> : shown.map((r) => (
              <tr key={`${r.type}-${r.id}`} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2"><span className={`badge badge-${r.type}`}>{TYPE_LABEL[r.type]}</span></td>
                <td className="px-3 py-2 tabular-nums">{r.odometer != null ? r.odometer.toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  {r.description}
                  {tireNames[r.tire_set_id] && <span className="badge badge-not-due ml-1.5 font-normal">{tireNames[r.tire_set_id]}</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{money(r.cost)}</td>
                <td className="px-3 py-2"><RowActions compact attachCount={r.attachment_count} onAttach={() => setAttach(r)} onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <CostRecordForm vehicleId={vehicleId} record={form.id ? form : null} initialType={form.type}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); loadTires(); onChange?.() }} />
      )}
      {attach && (
        <AttachmentsModal vehicleId={vehicleId} recordType={attach.type} recordId={attach.id}
          title={`Receipts — ${attach.description}`} onClose={() => setAttach(null)} onChanged={reload} />
      )}
      {toDelete && (
        <ConfirmDialog
          message={`Delete the ${TYPE_LABEL[toDelete.type].toLowerCase()} record “${toDelete.description}” from ${fmtDate(toDelete.date)}? Its attachments are deleted too.`}
          onConfirm={async () => { await del(toDelete); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </TabShell>
  )
}

// Items that mean this record happened to a specific set of tires — used to
// surface the tire picker only when it's relevant.
const TIRE_ITEM = /tire|tyre|rotat|wheel|balanc|align|tread|stud|snow|winter|summer|changeover|swap/i

function CostRecordForm({ vehicleId, record, initialType, onClose, onSaved }) {
  const { serviceOptions, refreshServiceTypes } = useSettings()
  const [type, setType] = useState(record?.type || initialType || 'service')
  const [f, setF] = useState(() => record ? {
    date: record.date, odometer: record.odometer != null ? String(record.odometer) : '',
    items: record.items || (record.description ? [record.description] : []),
    cost: String(record.cost), notes: record.notes || '',
  } : { date: today(), odometer: '', items: [], cost: '', notes: '' })
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // Tires: '' none · a set id · 'new' for a set created right here.
  const [tires, setTires] = useState(null)
  const [tireSet, setTireSet] = useState(record?.tire_set_id != null ? String(record.tire_set_id) : '')
  const [newSet, setNewSet] = useState({ name: '', expected_miles: '' })
  const [changeover, setChangeover] = useState(false)
  const [touchedTires, setTouchedTires] = useState(!!record)
  useEffect(() => { getTires(vehicleId).then(setTires).catch(() => setTires({ sets: [], mounted_set_id: null })) }, [vehicleId])

  const tireish = f.items.some((i) => TIRE_ITEM.test(i))
  const showTires = !!tires && (tireish || record?.tire_set_id != null)
  const mountedSet = tires?.sets.find((s) => s.id === tires.mounted_set_id) || null
  const chosenSetName = tireSet === 'new'
    ? (newSet.name.trim() || 'The new set')
    : tires?.sets.find((s) => String(s.id) === tireSet)?.name || 'This set'

  // On a fresh tire-related record, assume the set that's on the car — that's
  // what a rotation or a repair was done to.
  useEffect(() => {
    if (!tires || touchedTires || !tireish || tires.mounted_set_id == null) return
    setTireSet(String(tires.mounted_set_id))
  }, [tires, tireish, touchedTires])

  // Picking a set that isn't the one currently on the car *is* a changeover;
  // picking the mounted one is a rotation or a repair. Both stay overridable.
  const pickSet = (v) => {
    setTouchedTires(true)
    setTireSet(v)
    if (!tires) return
    setChangeover(v === 'new' || (v !== '' && Number(v) !== tires.mounted_set_id))
  }

  const save = async () => {
    if (f.items.length === 0) { setError('Add at least one item'); return }
    const odometer = f.odometer ? parseInt(f.odometer, 10) : null
    if (showTires && changeover && odometer == null) {
      setError('A changeover needs an odometer reading — it is what the set’s mileage is measured from')
      return
    }
    if (showTires && tireSet === 'new' && !newSet.name.trim()) { setError('Name the new tire set'); return }
    setSaving(true); setError(null)
    try {
      // A brand-new set is created first so the record can point at it.
      let setId = tireSet === '' ? null : tireSet === 'new' ? null : parseInt(tireSet, 10)
      if (showTires && tireSet === 'new') {
        const created = await createTireSet(vehicleId, {
          name: newSet.name.trim(),
          expected_miles: newSet.expected_miles === '' ? null : parseInt(newSet.expected_miles, 10),
          purchase_date: f.date,
        })
        setId = created.id
      }
      const body = {
        date: f.date, odometer, items: f.items,
        cost: f.cost ? parseFloat(f.cost) : 0, notes: f.notes,
        ...(showTires ? { tire_set_id: setId } : {}),
      }
      // Changing the record's kind moves it to another table (new id) first.
      let targetId = record?.id
      if (record && type !== record.type) {
        const moved = await convertRecord(vehicleId, record.type, record.id, type)
        targetId = moved.id
      }
      const saved = record ? await updateRecord(vehicleId, type, targetId, body) : await createRecord(vehicleId, type, body)
      // The swap itself is a separate event: the record says what was done, the
      // changeover says which set is on the car from this odometer on.
      if (showTires && changeover) {
        await createTireChange(vehicleId, { set_id: setId, date: f.date, odometer })
      }
      await uploadPending(vehicleId, type, record ? targetId : saved.id, pending)
      // The backend creates types for any new names; refresh the shared picker list.
      if (type === 'service' || record?.type === 'service') refreshServiceTypes()
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={record ? `Edit ${TYPE_LABEL[type].toLowerCase()}` : 'Add record'} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div>
        <label className="label">Type</label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-700/40">
          {RECORD_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`h-9 rounded-md text-sm font-medium transition-colors ${
                type === t ? 'bg-white dark:bg-slate-800 text-brand shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {record && type !== record.type && (
          <p className="text-[11px] text-slate-400 mt-1">Saving moves this record to {TYPE_LABEL[type].toLowerCase()}s — attachments come along.</p>
        )}
      </div>
      <div><label className="label">Date</label><input type="date" value={f.date} onChange={set('date')} className="input" /></div>
      <div>
        <label className="label">Items</label>
        <ItemsInput value={f.items} onChange={(items) => setF((s) => ({ ...s, items }))} options={type === 'service' ? serviceOptions : PRESETS[type]} placeholder="e.g. Oil change" />
        <p className="text-[11px] text-slate-400 mt-1">Add multiple if you did several things in one visit.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Odometer</label><input value={f.odometer} onChange={set('odometer')} inputMode="numeric" className="input" /></div>
        <div><label className="label">Cost</label><input value={f.cost} onChange={set('cost')} inputMode="decimal" className="input" /></div>
      </div>

      {showTires && (
        <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3">
          <label className="label">Which tires?</label>
          <select value={tireSet} onChange={(e) => pickSet(e.target.value)} className="input">
            <option value="">Not tied to a set</option>
            {tires.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.id === tires.mounted_set_id ? ' (on the car)' : ''}
              </option>
            ))}
            <option value="new">+ New set of tires…</option>
          </select>

          {tireSet === 'new' && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="label">Name</label>
                <input value={newSet.name} onChange={(e) => setNewSet((s) => ({ ...s, name: e.target.value }))}
                  className="input" placeholder="Summer — PS4S" />
              </div>
              <div>
                <label className="label">Rated for</label>
                <input value={newSet.expected_miles} onChange={(e) => setNewSet((s) => ({ ...s, expected_miles: e.target.value }))}
                  inputMode="numeric" className="input" placeholder="40000" />
              </div>
            </div>
          )}

          {tireSet !== '' && (
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={changeover} onChange={(e) => setChangeover(e.target.checked)} className="accent-brand w-4 h-4" />
              Changeover — this set goes on the car
            </label>
          )}
          {/* Spelling out the set names beats describing the mechanism: the
              sentence says exactly what saving will do. */}
          <p className="text-[11px] text-slate-400 mt-1">
            {tireSet === ''
              ? 'Pick a set so a rotation or repair records which tires it was.'
              : changeover
                ? `${chosenSetName} starts counting miles at ${f.odometer ? Number(f.odometer).toLocaleString() : 'this odometer'}` +
                  (mountedSet && String(mountedSet.id) !== tireSet ? `, and ${mountedSet.name} comes off.` : '.')
                : mountedSet
                  ? `Only recording which tires this was done to — ${mountedSet.name} stays on the car.`
                  : 'Only recording which tires this was done to.'}
          </p>
        </div>
      )}

      <div><label className="label">Notes</label><input value={f.notes} onChange={set('notes')} className="input" /></div>
      <RecordAttachments vehicleId={vehicleId} recordType={record?.type || type} recordId={record?.id} pending={pending} setPending={setPending} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

/* ---------- Tires ----------

   A tire set's mileage is never stored: the changeover timeline partitions the
   odometer, so each set's total is the sum of the stints it was on the car for.
   The backend does that math; everything here just presents it. */

const TREAD_CORNERS = [
  { k: 'lf', label: 'LF' }, { k: 'rf', label: 'RF' },
  { k: 'lr', label: 'LR' }, { k: 'rr', label: 'RR' },
]

// Worn-in colour ramp, matching the reminder bars: fine → getting on → replace.
const wearClass = (pct) =>
  pct == null ? 'bg-slate-400' : pct >= 0.9 ? 'bg-red-500' : pct >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500'

// Rotations turn amber and red later than tread wear does — being due is a
// nudge, not a problem, so the thresholds line up with the status wording.
const rotationBarClass = (pct) =>
  pct == null ? 'bg-slate-400' : pct >= 1 ? 'bg-red-500' : pct >= 0.85 ? 'bg-amber-500' : 'bg-emerald-500'

function WearBar({ pct, barClass }) {
  if (pct == null) return null
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
      <div className={`h-full rounded-full ${barClass || wearClass(pct)}`} style={{ width: `${Math.max(2, Math.round(pct * 100))}%` }} />
    </div>
  )
}

// How this set is doing on rotations — null when it doesn't track them.
function rotationStatus(s, u) {
  if (!s.rotate_miles) return null
  if (s.miles_since_rotation == null) {
    return { text: 'no rotation logged', cls: 'text-amber-500', pct: null }
  }
  const pct = s.miles_since_rotation / s.rotate_miles
  const left = s.rotate_miles - s.miles_since_rotation
  return {
    text: left < 0
      ? `rotation ${Math.abs(left).toLocaleString()} ${u.distance} overdue`
      : `${left.toLocaleString()} ${u.distance} to rotation`,
    cls: pct >= 1 ? 'text-red-500 font-medium' : pct >= 0.85 ? 'text-amber-500 font-medium' : 'text-slate-500 dark:text-slate-400',
    pct: Math.min(1, pct),
  }
}

function TiresTab({ vehicleId, money, distance, units, onChange, pendingAdd, onAddConsumed }) {
  const [data, setData] = useState(null)
  const [setForm, setSetForm] = useState(null)      // null | {} (add) | set (edit)
  const [changeForm, setChangeForm] = useState(null) // null | true (add) | change (edit)
  const [openSetId, setOpenSetId] = useState(null)  // drilled-into set

  const load = useCallback(() => getTires(vehicleId).then(setData), [vehicleId])
  useEffect(() => { load() }, [load])
  usePendingAdd(pendingAdd, onAddConsumed, () => setSetForm((f) => f ?? {}))

  // Every tire write returns the whole recomputed picture, so saving is one round trip.
  const applied = (fresh) => { setData(fresh); onChange?.() }

  if (!data) return <div className="text-slate-400 text-sm">Loading…</div>

  const open = data.sets.find((s) => s.id === openSetId)
  if (open) {
    return (
      <TireSetDetail
        vehicleId={vehicleId} set={open} odometer={data.odometer}
        money={money} distance={distance} units={units}
        onBack={() => setOpenSetId(null)} onChanged={applied}
        onGone={() => { setOpenSetId(null); load(); onChange?.() }}
      />
    )
  }

  const mounted = data.sets.find((s) => s.is_mounted) || null
  const garage = data.sets.filter((s) => !s.is_mounted && !s.is_retired)
  const retired = data.sets.filter((s) => !s.is_mounted && s.is_retired)

  return (
    <TabShell title="Tire sets" addLabel="Add tire set" onAdd={() => setSetForm({})}>
      {data.sets.length === 0 ? (
        <EmptyCard
          label="No tire sets yet. Add one for each physical set you own — the miles on each are worked out from your changeovers."
          actionLabel="Add a tire set"
          onAction={() => setSetForm({})}
        />
      ) : (
        <div className="space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="stat-label !mb-0">On the car</p>
              <div className="flex-1" />
              <button onClick={() => setChangeForm(true)} className="btn-ghost text-xs">
                <Repeat size={13} /> Log changeover
              </button>
            </div>
            {mounted ? (
              <TireSetCard s={mounted} money={money} units={units} onOpen={() => setOpenSetId(mounted.id)} />
            ) : (
              <div className="card p-4 text-sm text-slate-400">
                No set is marked as mounted.{' '}
                <button onClick={() => setChangeForm(true)} className="text-brand hover:underline">Log a changeover</button>{' '}
                to start counting miles.
              </div>
            )}
          </section>

          {garage.length > 0 && (
            <section>
              <p className="stat-label mb-2">In the garage</p>
              <div className="space-y-2">
                {garage.map((s) => <TireSetCard key={s.id} s={s} money={money} units={units} onOpen={() => setOpenSetId(s.id)} />)}
              </div>
            </section>
          )}

          {retired.length > 0 && (
            <section>
              <p className="stat-label mb-2">Retired</p>
              <div className="space-y-2">
                {retired.map((s) => <TireSetCard key={s.id} s={s} money={money} units={units} onOpen={() => setOpenSetId(s.id)} />)}
              </div>
            </section>
          )}

          {data.changes.length > 0 && (
            <section>
              <p className="stat-label mb-2">Changeover history</p>
              <div className="card divide-y divide-slate-100 dark:divide-white/[0.04]">
                {data.changes.map((c) => (
                  <div key={c.id} className="flex items-center gap-1 pr-2">
                    <button
                      onClick={() => setChangeForm(c)}
                      className="flex items-center gap-3 px-3 py-2 text-sm flex-1 min-w-0 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="tabular-nums text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">{fmtDate(c.date)}</span>
                      <span className="min-w-0 truncate flex-1">
                        {c.set_name || <span className="text-slate-400 italic">nothing mounted</span>}
                        {c.is_redundant && (
                          <span className="badge badge-due-soon ml-1.5 font-normal" title="This set was already on the car — this row only splits one stint in two">
                            already on
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                        at {c.odometer.toLocaleString()}
                        {c.miles != null && ` · ran ${c.miles.toLocaleString()} ${units.distance}${c.is_current ? ' so far' : ''}`}
                      </span>
                    </button>
                    <button
                      onClick={async () => applied(await deleteTireChange(vehicleId, c.id))}
                      className="text-slate-400 hover:text-red-500 p-1 flex-shrink-0"
                      title="Delete changeover" aria-label="Delete changeover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Each changeover runs until the next one — the newest counts up to your current odometer.
                Tap one to correct its date or odometer.
              </p>
            </section>
          )}
        </div>
      )}

      {setForm && (
        <TireSetForm
          vehicleId={vehicleId} set={setForm.id ? setForm : null} odometer={data.odometer} units={units}
          onClose={() => setSetForm(null)} onSaved={(fresh) => { setSetForm(null); applied(fresh) }}
        />
      )}
      {changeForm && (
        <ChangeoverForm
          vehicleId={vehicleId} sets={data.sets} mountedId={data.mounted_set_id} odometer={data.odometer}
          change={changeForm === true ? null : changeForm}
          onClose={() => setChangeForm(null)} onSaved={(fresh) => { setChangeForm(null); applied(fresh) }}
        />
      )}
    </TabShell>
  )
}

function TireSetCard({ s, money, units, onOpen }) {
  const rot = rotationStatus(s, units)
  return (
    <button onClick={onOpen} className="card p-3 w-full text-left hover:border-brand/40 transition-colors">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium truncate min-w-0">{s.name}</span>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0">
          {s.miles.toLocaleString()} {units.distance}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate min-w-0">
          {s.size && `${s.size} · `}
          {s.is_mounted && s.mounted_since
            ? `on since ${fmtDate(s.mounted_since.date)} at ${s.mounted_since.odometer.toLocaleString()}`
            : s.last_change
              ? `off since ${fmtDate(s.last_change.date)}`
              : 'never mounted'}
        </span>
        {rot && <span className={`text-xs flex-shrink-0 tabular-nums ${rot.cls}`}>{rot.text}</span>}
      </div>
      {(s.expected_miles > 0 || s.baseline_miles > 0) && (
        <>
          {s.expected_miles > 0 && <WearBar pct={s.wear_pct} />}
          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
            {[
              s.expected_miles > 0 && `${Math.round((s.wear_pct ?? 0) * 100)}% of ${s.expected_miles.toLocaleString()} ${units.distance}`,
              s.baseline_miles > 0 && `incl. ${s.baseline_miles.toLocaleString()} before tracking`,
              s.cost_per_1000 != null && `${money(s.cost_per_1000)}/1,000 ${units.distance}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </>
      )}
    </button>
  )
}

function TireSetDetail({ vehicleId, set: s, odometer, money, distance, units, onBack, onChanged, onGone }) {
  const [editing, setEditing] = useState(false)
  const [treadForm, setTreadForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rot = rotationStatus(s, units)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="btn-ghost text-xs"><ArrowLeft size={14} /> Tire sets</button>
        <div className="flex-1" />
        <button onClick={() => setEditing(true)} className="btn-ghost text-xs"><Pencil size={13} /> Edit</button>
      </div>

      <h2 className="text-base font-semibold mb-0.5">{s.name}</h2>
      <p className="text-xs text-slate-400 mb-4">
        {[s.size, s.purchase_date && `bought ${fmtDate(s.purchase_date)}`, s.cost != null && money(s.cost)].filter(Boolean).join(' · ') || 'No purchase details'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label={`${units.distance === 'mi' ? 'Miles' : 'Distance'} on set`} value={`${s.miles.toLocaleString()} ${units.distance}`} />
        <Stat label="Status" value={s.is_mounted ? 'On the car' : s.is_retired ? 'Retired' : 'In the garage'} />
        <Stat label="Life used" value={s.wear_pct != null ? `${Math.round(s.wear_pct * 100)}%` : '—'} />
        <Stat label={`Cost / 1,000 ${units.distance}`} value={s.cost_per_1000 != null ? money(s.cost_per_1000) : '—'} />
      </div>

      {s.expected_miles > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="stat-label !mb-0">Tread life</p>
            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {s.miles.toLocaleString()} of {s.expected_miles.toLocaleString()} {units.distance}
              {s.miles < s.expected_miles && ` · ${(s.expected_miles - s.miles).toLocaleString()} left`}
            </p>
          </div>
          <WearBar pct={s.wear_pct} />
          {s.baseline_miles > 0 && (
            <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
              {s.baseline_miles.toLocaleString()} estimated before tracking + {s.tracked_miles.toLocaleString()} logged since.
            </p>
          )}
        </div>
      )}

      {rot && (
        <div className="card p-4 mb-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="stat-label !mb-0">Rotation</p>
            <p className={`text-xs tabular-nums ${rot.cls}`}>{rot.text}</p>
          </div>
          <WearBar pct={rot.pct} barClass={rotationBarClass(rot.pct)} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            {s.last_rotation
              ? `Last rotated ${fmtDate(s.last_rotation.date)}${s.last_rotation.odometer != null ? ` at ${s.last_rotation.odometer.toLocaleString()}` : ''} — ${s.miles_since_rotation.toLocaleString()} ${units.distance} on this set since.`
              : `No rotation recorded on this set yet. Log a service with a “rotation” item and tag it to this set.`}
          </p>
        </div>
      )}

      <div className="mb-5">
        <p className="stat-label mb-2">Time on the car</p>
        {s.records.length === 0 && !s.last_change ? (
          <div className="card p-4 text-sm text-slate-400">Never mounted — log a changeover to start counting.</div>
        ) : (
          <div className="card p-4 text-sm text-slate-600 dark:text-slate-300">
            {s.is_mounted && s.mounted_since
              ? <>On the car since {fmtDate(s.mounted_since.date)} at {s.mounted_since.odometer.toLocaleString()} — {(odometer - s.mounted_since.odometer).toLocaleString()} {units.distance} this stint.</>
              : s.last_change
                ? <>Last came off after {fmtDate(s.last_change.date)}, mounted at {s.last_change.odometer.toLocaleString()}.</>
                : 'Never mounted.'}
          </div>
        )}
      </div>

      <div className="mb-5">
        <p className="stat-label mb-2">Services on this set</p>
        {s.records.length === 0 ? (
          <div className="card p-4 text-sm text-slate-400">
            Nothing tagged to this set yet — tag a rotation, balance or repair to it from the Service tab.
          </div>
        ) : (
          <div className="card divide-y divide-slate-100 dark:divide-white/[0.04]">
            {s.records.map((r) => (
              <div key={`${r.type}-${r.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="tabular-nums text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">{fmtDate(r.date)}</span>
                <span className="min-w-0 truncate flex-1">
                  {r.description}
                  {r.is_rotation && <span className="badge badge-not-due ml-1.5">rotation</span>}
                </span>
                <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                  {r.odometer != null && `${r.odometer.toLocaleString()} · `}{money(r.cost)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <p className="stat-label !mb-0">Tread depth</p>
          <div className="flex-1" />
          <button onClick={() => setTreadForm(true)} className="btn-ghost text-xs"><Plus size={13} /> Add reading</button>
        </div>
        {s.treads.length === 0 ? (
          <div className="card p-4 text-sm text-slate-400">No measurements yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Odometer</th>
                  {TREAD_CORNERS.map((c) => <th key={c.k} className="px-3 py-2 font-medium">{c.label}</th>)}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.treads.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 tabular-nums">{t.odometer != null ? t.odometer.toLocaleString() : '—'}</td>
                    {TREAD_CORNERS.map((c) => (
                      <td key={c.k} className="px-3 py-2 tabular-nums">{t[c.k] != null ? t[c.k] : '—'}</td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={async () => onChanged(await deleteTread(vehicleId, t.id))}
                        className="text-slate-400 hover:text-red-500 p-1" title="Delete reading" aria-label="Delete reading"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-1.5">Depths in 32nds of an inch (or mm — whatever you measure in). New tires are around 10–11/32".</p>
      </div>

      {s.notes && (
        <div className="card p-4 mb-5">
          <p className="stat-label mb-1">Notes</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{s.notes}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-xs text-red-500 hover:text-red-500">
          <Trash2 size={13} /> Delete this set…
        </button>
      </div>

      {editing && (
        <TireSetForm
          vehicleId={vehicleId} set={s} odometer={odometer} units={units}
          onClose={() => setEditing(false)} onSaved={(fresh) => { setEditing(false); onChanged(fresh) }}
        />
      )}
      {treadForm && (
        <TreadForm
          vehicleId={vehicleId} setId={s.id} odometer={odometer}
          onClose={() => setTreadForm(false)} onSaved={(fresh) => { setTreadForm(false); onChanged(fresh) }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete “${s.name}”? Its changeovers and tread readings go with it, and any records tagged to it lose the tag (the records themselves stay).`}
          onConfirm={async () => { await deleteTireSet(vehicleId, s.id); setConfirmDelete(false); onGone() }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function TireSetForm({ vehicleId, set, odometer, units, onClose, onSaved }) {
  const [f, setF] = useState(() => set ? {
    name: set.name, size: set.size || '', purchase_date: set.purchase_date || '',
    cost: set.cost != null ? String(set.cost) : '',
    expected_miles: set.expected_miles != null ? String(set.expected_miles) : '',
    rotate_miles: set.rotate_miles != null ? String(set.rotate_miles) : '',
    baseline_miles: set.baseline_miles != null ? String(set.baseline_miles) : '',
    notes: set.notes || '', is_retired: !!set.is_retired,
  } : {
    name: '', size: '', purchase_date: '', cost: '', expected_miles: '', rotate_miles: '',
    baseline_miles: '', notes: '', is_retired: false,
  })
  const expected = parseInt(f.expected_miles, 10) || 0
  // New sets are usually going straight onto the car.
  const [mount, setMount] = useState(!set)
  const [mountOdo, setMountOdo] = useState(odometer != null ? String(odometer) : '')
  const [mountDate, setMountDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const setV = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    if (!f.name.trim()) { setError('Give the set a name'); return }
    setSaving(true); setError(null)
    const body = {
      name: f.name.trim(), size: f.size.trim() || null, purchase_date: f.purchase_date || null,
      cost: f.cost === '' ? null : parseFloat(f.cost),
      expected_miles: f.expected_miles === '' ? null : parseInt(f.expected_miles, 10),
      rotate_miles: f.rotate_miles === '' ? null : parseInt(f.rotate_miles, 10),
      baseline_miles: f.baseline_miles === '' ? null : parseInt(f.baseline_miles, 10),
      notes: f.notes.trim() || null, is_retired: f.is_retired,
    }
    try {
      if (set) onSaved(await updateTireSet(vehicleId, set.id, body))
      else onSaved(await createTireSet(vehicleId, {
        ...body,
        ...(mount && mountOdo !== '' ? { mount_odometer: parseInt(mountOdo, 10), mount_date: mountDate } : {}),
      }))
    } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title={set ? 'Edit tire set' : 'Add tire set'} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div>
        <label className="label">Name</label>
        <input value={f.name} onChange={setV('name')} className="input" placeholder="e.g. Winter — Blizzak WS90" autoFocus={!set} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Size (optional)</label><input value={f.size} onChange={setV('size')} className="input" placeholder="225/60R18" /></div>
        <div><label className="label">Bought on</label><input type="date" value={f.purchase_date} onChange={setV('purchase_date')} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Cost</label>
          <input value={f.cost} onChange={setV('cost')} inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label">Rated for ({units.distance})</label>
          <input value={f.expected_miles} onChange={setV('expected_miles')} inputMode="numeric" className="input" placeholder="40000" />
        </div>
      </div>
      <div>
        <label className="label">Rotate every ({units.distance}, optional)</label>
        <input value={f.rotate_miles} onChange={setV('rotate_miles')} inputMode="numeric" className="input" placeholder="6000" />
        <p className="text-[11px] text-slate-400 mt-1">
          Counts only while this set is on the car, from the last service tagged to it with a “rotation” item.
        </p>
      </div>
      <div>
        <label className="label">Already on them ({units.distance}, optional)</label>
        <input value={f.baseline_miles} onChange={setV('baseline_miles')} inputMode="numeric" className="input" placeholder="0" />
        {/* Starting to track a half-worn set is the normal case, not the
            exception — so make the estimate a two-tap job. */}
        {expected > 0 && (
          <div className="flex gap-1.5 mt-1.5">
            {[[0.25, '¼ used'], [0.5, 'half used'], [0.75, '¾ used']].map(([frac, label]) => (
              <button key={frac} type="button"
                onClick={() => setF((s) => ({ ...s, baseline_miles: String(Math.round(expected * frac)) }))}
                className="chip chip-off text-[11px]">
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-1">
          For tires you were already running before you started tracking. A rough guess is fine — everything from
          here on gets added to it.
        </p>
      </div>
      <div><label className="label">Notes</label><input value={f.notes} onChange={setV('notes')} className="input" placeholder="Stored in the garage, DOT 2419…" /></div>

      {set ? (
        <label className="flex items-center gap-2 text-sm py-1">
          <input type="checkbox" checked={f.is_retired} onChange={(e) => setF((s) => ({ ...s, is_retired: e.target.checked }))} className="accent-brand w-4 h-4" />
          Retired
          <span className="text-xs text-slate-400">— worn out or sold; keeps its history</span>
        </label>
      ) : (
        <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mount} onChange={(e) => setMount(e.target.checked)} className="accent-brand w-4 h-4" />
            Put this set on the car now
          </label>
          {mount && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><label className="label">Fitted on</label><input type="date" value={mountDate} onChange={(e) => setMountDate(e.target.value)} className="input" /></div>
              <div><label className="label">At odometer</label><input value={mountOdo} onChange={(e) => setMountOdo(e.target.value)} inputMode="numeric" className="input" /></div>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            {mount ? 'Miles start counting from this reading.' : 'Leave off for a set you already own but that is not on the car — log a changeover when it goes on.'}
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

function ChangeoverForm({ vehicleId, sets, mountedId, odometer, change, onClose, onSaved }) {
  // Editing keeps what's there; a new one defaults to whatever is not currently
  // on the car — the usual swap.
  const [setId, setSetId] = useState(() => {
    if (change) return change.set_id != null ? String(change.set_id) : ''
    const other = sets.find((s) => !s.is_mounted && !s.is_retired)
    return other ? String(other.id) : ''
  })
  const [date, setDate] = useState(change?.date || today())
  const [odo, setOdo] = useState(change ? String(change.odometer) : odometer != null ? String(odometer) : '')
  const [notes, setNotes] = useState(change?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    if (odo === '') { setError('An odometer reading is required — it is what the mileage is measured from'); return }
    setSaving(true); setError(null)
    const body = {
      set_id: setId === '' ? null : parseInt(setId, 10),
      date, odometer: parseInt(odo, 10), notes: notes.trim() || null,
    }
    try {
      onSaved(change ? await updateTireChange(vehicleId, change.id, body) : await createTireChange(vehicleId, body))
    } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title={change ? 'Edit changeover' : 'Log a changeover'} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div>
        <label className="label">Which set went on?</label>
        <select value={setId} onChange={(e) => setSetId(e.target.value)} className="input">
          {sets.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.id === mountedId ? ' (on now)' : ''}</option>
          ))}
          <option value="">Nothing / untracked tires</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></div>
        <div><label className="label">Odometer</label><input value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" className="input" /></div>
      </div>
      <div><label className="label">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" /></div>
      <p className="text-[11px] text-slate-400">
        {change
          ? 'Moving the date or odometer re-splits the miles between this set and whatever was on either side of it.'
          : 'The set that was on until now stops counting here, and this one starts. Logging an old swap you forgot works the same way — the totals re-sort themselves.'}
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

function TreadForm({ vehicleId, setId, odometer, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), odometer: odometer != null ? String(odometer) : '', lf: '', rf: '', lr: '', rr: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      onSaved(await createTread(vehicleId, setId, {
        date: f.date, odometer: f.odometer === '' ? null : parseInt(f.odometer, 10),
        ...Object.fromEntries(TREAD_CORNERS.map((c) => [c.k, f[c.k] === '' ? null : parseFloat(f[c.k])])),
        notes: f.notes.trim() || null,
      }))
    } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title="Add tread reading" onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Date</label><input type="date" value={f.date} onChange={set('date')} className="input" /></div>
        <div><label className="label">Odometer</label><input value={f.odometer} onChange={set('odometer')} inputMode="numeric" className="input" /></div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {TREAD_CORNERS.map((c) => (
          <div key={c.k}>
            <label className="label">{c.label}</label>
            <input value={f[c.k]} onChange={set(c.k)} inputMode="decimal" className="input" placeholder="—" />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Left/right front and rear. Fill in as many as you measured.</p>
      <div><label className="label">Notes</label><input value={f.notes} onChange={set('notes')} className="input" /></div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

/* ---------- Odometer ---------- */

const ODO_COLUMNS = [
  { k: 'date', label: 'Date' },
  { k: 'odometer', label: 'Reading' },
  { k: 'notes', label: 'Notes' },
]

function OdometerTab({ vehicleId, distance, onChange, pendingAdd, onAddConsumed }) {
  const { rows, reload } = useRecords(() => getRecords(vehicleId, 'odometer'), [vehicleId])
  const { sort, sortBy, setSort } = useSort()
  const sorted = useMemo(() => applySort(rows, sort), [rows, sort])
  const [form, setForm] = useState(null)
  usePendingAdd(pendingAdd, onAddConsumed, () => setForm((f) => f ?? {}))
  const [toDelete, setToDelete] = useState(null)
  const del = async (rid) => { await deleteRecord(vehicleId, 'odometer', rid); reload(); onChange?.() }

  return (
    <TabShell title="Odometer" addLabel="Add reading" onAdd={() => setForm({})}>
      {rows.length > 0 && <MobileSortBar columns={ODO_COLUMNS} sort={sort} setSort={setSort} />}
      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {sorted.length === 0 ? (
          <EmptyCard label="No odometer readings yet." actionLabel="Add a reading" onAction={() => setForm({})} />
        ) : sorted.map((r) => (
          <div key={r.id} className="card p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">{distance(r.odometer)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{fmtDate(r.date)}{r.notes ? ` · ${r.notes}` : ''}</p>
            </div>
            <RowActions onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} />
          </div>
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="card overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-white/[0.06]">
              {ODO_COLUMNS.map((c) => <Th key={c.k} label={c.label} k={c.k} sort={sort} onSort={sortBy} />)}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? <EmptyRow colSpan={4} label="No odometer readings yet." /> : sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2 tabular-nums">{distance(r.odometer)}</td>
                <td className="px-3 py-2 text-slate-500">{r.notes || '—'}</td>
                <td className="px-3 py-2"><RowActions compact onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <OdometerForm vehicleId={vehicleId} record={form.id ? form : null}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); onChange?.() }} />
      )}
      {toDelete && (
        <ConfirmDialog
          message={`Delete the ${distance(toDelete.odometer)} reading from ${fmtDate(toDelete.date)}?`}
          onConfirm={async () => { await del(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </TabShell>
  )
}

function OdometerForm({ vehicleId, record, onClose, onSaved }) {
  const [f, setF] = useState(() => record
    ? { date: record.date, odometer: String(record.odometer), notes: record.notes || '' }
    : { date: today(), odometer: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const readingRef = useRef(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => { if (!record) readingRef.current?.focus() }, [record])

  const save = async () => {
    if (!f.odometer) { setError('Reading is required.'); return }
    setSaving(true); setError(null)
    const body = { date: f.date, odometer: parseInt(f.odometer, 10), notes: f.notes }
    try {
      if (record) await updateRecord(vehicleId, 'odometer', record.id, body)
      else await createRecord(vehicleId, 'odometer', body)
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={record ? 'Edit reading' : 'Add odometer reading'} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div><label className="label">Reading</label><input ref={readingRef} value={f.odometer} onChange={set('odometer')} inputMode="numeric" className="input" /></div>
      <div><label className="label">Date</label><input type="date" value={f.date} onChange={set('date')} className="input" /></div>
      <div><label className="label">Notes</label><input value={f.notes} onChange={set('notes')} className="input" /></div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

/* ---------- Reminders ---------- */

function intervalText(r, u) {
  const parts = []
  if (r.interval_miles) parts.push(`${r.interval_miles.toLocaleString()} ${u.distance}`)
  if (r.interval_months) parts.push(`${r.interval_months} mo`)
  return parts.join(' / ')
}

function ReminderTab({ vehicleId, distance, currentOdo, onOpenTires, onAddTireSet, pendingAdd, onAddConsumed }) {
  const { units } = useSettings()
  const { rows, reload } = useRecords(() => getReminders(vehicleId), [vehicleId])
  const [form, setForm] = useState(null)
  usePendingAdd(pendingAdd, onAddConsumed, () => setForm((f) => f ?? {}))
  const [toDelete, setToDelete] = useState(null)
  const del = async (rid) => { await deleteReminder(vehicleId, rid); reload() }

  return (
    <TabShell title="Reminders" addLabel="Add reminder" onAdd={() => setForm({})}>
      {rows.length === 0 ? (
        <EmptyCard
          label="No reminders yet. Add one with an interval and it'll advance automatically each time you log that service."
          actionLabel="Add a reminder" onAction={() => setForm({})} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const progress = r.has_baseline ? reminderProgress(r, currentOdo) : null
            return (
              <div key={r.id} className="card p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium truncate min-w-0">
                    {r.description}
                    {r.source === 'tire' && <span className="badge badge-not-due ml-1.5 font-normal">from tire set</span>}
                  </p>
                  <span className={`text-xs flex-shrink-0 tabular-nums ${reminderStatusClass(r)}`}>
                    {reminderStatus(r, currentOdo, units)}
                  </span>
                </div>
                <ReminderProgressBar r={r} progress={progress} />
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 min-w-0 truncate">
                    {r.is_recurring ? <>Every {intervalText(r, units)}</> : 'One-time'}
                    {r.is_recurring && r.has_baseline && r.last_done_date && (
                      <> · last done {fmtDate(r.last_done_date)}{r.last_done_odometer != null && <> at {distance(r.last_done_odometer)}</>}</>
                    )}
                    {r.source === 'tire' && !r.last_done_date && <> · counted from the miles on this set</>}
                    {!r.is_recurring && r.due_date && r.due_odometer != null && (
                      <> · due by {fmtDate(r.due_date)} or at {distance(r.due_odometer)}</>
                    )}
                    {!r.has_baseline && (
                      <span className="text-amber-500"> · log this service or set a starting point</span>
                    )}
                  </p>
                  {/* Tire reminders have no row to edit — they follow the set. */}
                  {r.source === 'tire' ? (
                    <button onClick={onOpenTires} className="btn-ghost text-xs flex-shrink-0">Tire set</button>
                  ) : (
                    <RowActions onEdit={() => setForm(r)} onDelete={() => setToDelete(r)} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {form && (
        <ReminderForm vehicleId={vehicleId} record={form.id ? form : null} onAddTireSet={onAddTireSet}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
      )}
      {toDelete && (
        <ConfirmDialog
          message={`Delete the “${toDelete.description}” reminder?`}
          onConfirm={async () => { await del(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </TabShell>
  )
}

function ReminderForm({ vehicleId, record, onAddTireSet, onClose, onSaved }) {
  const { serviceOptions, refreshServiceTypes, units } = useSettings()
  const [f, setF] = useState(() => record ? {
    description: record.description,
    is_recurring: !!record.is_recurring,
    interval_miles: record.interval_miles ? String(record.interval_miles) : '',
    interval_months: record.interval_months ? String(record.interval_months) : '',
    base_date: record.base_date || '',
    base_odometer: record.base_odometer != null ? String(record.base_odometer) : '',
    due_date: (!record.is_recurring && record.due_date) || '',
    due_odometer: !record.is_recurring && record.due_odometer != null ? String(record.due_odometer) : '',
  } : {
    description: '', is_recurring: true,
    interval_miles: '', interval_months: '', base_date: '', base_odometer: '',
    due_date: '', due_odometer: '',
  })
  const [showBaseline, setShowBaseline] = useState(!!(record?.base_date || record?.base_odometer != null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const isNewService = f.description.trim() &&
    !serviceOptions.some((o) => o.toLowerCase() === f.description.trim().toLowerCase())

  // Tires have a better home than a plain reminder: a tire set knows which
  // physical set is on the car and reminds you against that one.
  const [tireSetCount, setTireSetCount] = useState(null)
  useEffect(() => { getTires(vehicleId).then((t) => setTireSetCount(t.sets.length)).catch(() => setTireSetCount(0)) }, [vehicleId])
  const suggestTires = !record && onAddTireSet && /\btires?\b|\btyres?\b|rotat|tread|changeover/i.test(f.description)

  const save = async () => {
    if (!f.description.trim()) { setError('Give the reminder a service or description.'); return }
    if (f.is_recurring && !f.interval_miles && !f.interval_months) {
      setError('Set a mileage interval, a time interval, or both.'); return
    }
    if (!f.is_recurring && !f.due_date && !f.due_odometer) {
      setError('Set a due date, a due odometer, or both.'); return
    }
    setSaving(true); setError(null)
    const body = {
      description: f.description.trim(),
      is_recurring: f.is_recurring,
      interval_miles: f.is_recurring && f.interval_miles ? parseInt(f.interval_miles, 10) : null,
      interval_months: f.is_recurring && f.interval_months ? parseInt(f.interval_months, 10) : null,
      base_date: f.is_recurring && showBaseline ? (f.base_date || null) : null,
      base_odometer: f.is_recurring && showBaseline && f.base_odometer ? parseInt(f.base_odometer, 10) : null,
      due_date: !f.is_recurring ? (f.due_date || null) : null,
      due_odometer: !f.is_recurring && f.due_odometer ? parseInt(f.due_odometer, 10) : null,
    }
    try {
      if (record) await updateReminder(vehicleId, record.id, body)
      else await createReminder(vehicleId, body)
      // A brand-new description became a reusable service type server-side.
      if (isNewService) refreshServiceTypes()
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={record ? 'Edit reminder' : 'Add reminder'} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} saving={saving} />}>
      <div>
        <label className="label">Service</label>
        <Combobox value={f.description} onChange={(v) => setF((s) => ({ ...s, description: v }))} options={serviceOptions} placeholder="Oil change" />
        <p className="text-[11px] text-slate-400 mt-1">
          {isNewService
            ? <>“{f.description.trim()}” will be saved as a new service type.</>
            : 'Match a service item so the reminder advances automatically when you log it.'}
        </p>
      </div>

      {suggestTires && (
        <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
          <p className="text-xs font-medium mb-1 flex items-center gap-1.5"><Disc3 size={13} className="text-brand" /> Track this as a tire set instead?</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {tireSetCount > 0
              ? 'Your tire sets already put a rotation reminder on this page — against whichever set is on the car, so the countdown pauses while a set is in the garage.'
              : 'A tire set counts miles per physical set (summer vs winter), reminds you to rotate whichever one is on the car, and records which set each rotation was done to. A plain reminder can’t tell them apart.'}
          </p>
          <button type="button" onClick={onAddTireSet} className="btn-primary text-xs mt-2">
            <Plus size={13} /> {tireSetCount > 0 ? 'Add another tire set' : 'Add a tire set'}
          </button>
          <p className="text-[11px] text-slate-400 mt-1.5">Or carry on below for an ordinary reminder.</p>
        </div>
      )}

      <div>
        <label className="label">Repeats</label>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-700/40">
          {[{ v: true, label: 'Recurring' }, { v: false, label: 'One-time' }].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => setF((s) => ({ ...s, is_recurring: o.v }))}
              className={`h-9 rounded-md text-sm font-medium transition-colors ${
                f.is_recurring === o.v ? 'bg-white dark:bg-slate-800 text-brand shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {f.is_recurring ? (
        <>
          <div>
            <label className="label">Repeat every</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input value={f.interval_miles} onChange={set('interval_miles')} inputMode="numeric" className="input pr-12" placeholder="5000" aria-label="Distance interval" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{units.distance}</span>
              </div>
              <div className="relative">
                <input value={f.interval_months} onChange={set('interval_months')} inputMode="numeric" className="input pr-16" placeholder="6" aria-label="Interval in months" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">months</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Fill in one or both — it comes due at whichever happens first.</p>
          </div>

          {!showBaseline ? (
            <button type="button" onClick={() => setShowBaseline(true)} className="btn-ghost text-xs -ml-1">
              <Plus size={12} /> Set a starting point (last done)
            </button>
          ) : (
            <div className="space-y-3 border-t border-slate-200 dark:border-white/[0.06] pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Last done (used until you log this service):</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date</label><input type="date" value={f.base_date} onChange={set('base_date')} className="input" /></div>
                <div><label className="label">Odometer</label><input value={f.base_odometer} onChange={set('base_odometer')} inputMode="numeric" className="input" /></div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div>
          <label className="label">Due</label>
          <div className="grid grid-cols-2 gap-3">
            <div><input type="date" value={f.due_date} onChange={set('due_date')} className="input" aria-label="Due date" /></div>
            <div className="relative">
              <input value={f.due_odometer} onChange={set('due_odometer')} inputMode="numeric" className="input pr-8" placeholder="55000" aria-label="Due odometer" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{units.distance}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">A date, an odometer reading, or both. It won't repeat after it's due.</p>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}
