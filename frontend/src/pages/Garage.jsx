import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Car, Gauge, Fuel, Zap } from 'lucide-react'
import { getVehicles, createVehicle, attachmentUrl } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import Modal from '../components/Modal.jsx'

function vehicleTitle(v) {
  const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return v.name || ymm || 'Unnamed vehicle'
}

function VehicleAvatar({ v }) {
  if (v.photo_attachment_id) {
    return <img src={attachmentUrl(v.photo_attachment_id)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
  }
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
      v.is_archived ? 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-400' : 'bg-brand/10 text-brand'
    }`}>
      <Car size={20} />
    </div>
  )
}

function AddVehicleModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ year: '', make: '', model: '', name: '', license_plate: '', is_electric: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const created = await createVehicle({
        ...form,
        year: form.year ? parseInt(form.year, 10) : null,
      })
      onCreated(created)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Add vehicle"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 sm:flex-none disabled:opacity-50">
          {saving ? 'Saving…' : 'Add vehicle'}
        </button>
      </>}
    >
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Year</label><input value={form.year} onChange={set('year')} inputMode="numeric" className="input" placeholder="2021" /></div>
        <div className="col-span-2"><label className="label">Make</label><input value={form.make} onChange={set('make')} className="input" placeholder="Toyota" /></div>
      </div>
      <div><label className="label">Model</label><input value={form.model} onChange={set('model')} className="input" placeholder="Tacoma" /></div>
      <div><label className="label">Nickname (optional)</label><input value={form.name} onChange={set('name')} className="input" placeholder="The truck" /></div>
      <div><label className="label">License plate (optional)</label><input value={form.license_plate} onChange={set('license_plate')} className="input" /></div>
      <label className="flex items-center gap-2 text-sm py-1">
        <input type="checkbox" checked={form.is_electric} onChange={(e) => setForm((f) => ({ ...f, is_electric: e.target.checked }))} className="accent-brand w-4 h-4" />
        Electric vehicle <span className="text-xs text-slate-400">— tracks charging in kWh</span>
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Modal>
  )
}

export default function Garage() {
  const navigate = useNavigate()
  const { money, distance } = useSettings()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setVehicles(await getVehicles(true)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const active = vehicles.filter((v) => !v.is_archived)
  const sold = vehicles.filter((v) => v.is_archived)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">Garage</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{active.length} vehicle{active.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary"><Plus size={15} /> Add vehicle</button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-28 animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500">
          <Car size={36} className="mb-3" />
          <p className="text-sm">No vehicles yet</p>
          <button onClick={() => setAdding(true)} className="btn-ghost mt-3 text-xs"><Plus size={13} /> Add your first vehicle</button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((v) => (
              <div key={v.id} className="card p-4 relative hover:ring-1 hover:ring-brand/30 transition-all">
                {/* Stretched link: the whole card navigates, while quick actions sit above it. */}
                <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-xl" />
                <div className="flex items-start gap-3">
                  <VehicleAvatar v={v} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{vehicleTitle(v)}</p>
                    {v.license_plate && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{v.license_plate}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Gauge size={14} className="text-slate-400" /> {distance(v.odometer)}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 tabular-nums">{money(v.total_cost)}</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => navigate(`/vehicle/${v.id}?tab=fuel&add=1`)}
                    className="btn-ghost relative z-10 -my-1.5 -mr-2 text-brand hover:text-brand"
                    title={v.is_electric ? 'Log charge' : 'Log fuel'}
                    aria-label={`${v.is_electric ? 'Log charge' : 'Log fuel'} for ${vehicleTitle(v)}`}
                  >
                    {v.is_electric ? <Zap size={16} /> : <Fuel size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {sold.length > 0 && (
            <div className="mt-8">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                Sold ({sold.length})
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sold.map((v) => (
                  <div key={v.id} className="card p-4 relative opacity-70 hover:opacity-100 hover:ring-1 hover:ring-brand/30 transition-all">
                    <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-xl" />
                    <div className="flex items-start gap-3">
                      <VehicleAvatar v={v} />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{vehicleTitle(v)}</p>
                        <p className="text-xs text-amber-500 truncate">
                          Sold{v.sold_date ? ` ${new Date(v.sold_date + 'T00:00:00').toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-sm">
                      <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <Gauge size={14} className="text-slate-400" /> {distance(v.odometer)}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 tabular-nums">{money(v.total_cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddVehicleModal
          onClose={() => setAdding(false)}
          onCreated={(v) => { setAdding(false); navigate(`/vehicle/${v.id}`) }}
        />
      )}
    </div>
  )
}
