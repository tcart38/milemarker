import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Car, Fuel, Zap, ChevronRight } from 'lucide-react'
import { getVehicles, createVehicle, attachmentUrl } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import Modal from '../components/Modal.jsx'
import { vehicleTitle } from '../vehicles.js'

function VehicleAvatar({ v }) {
  if (v.photo_attachment_id) {
    return <img src={attachmentUrl(v.photo_attachment_id)} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
  }
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
 v.is_archived ? 'bg-wash/[0.08] text-tertiary' : 'bg-accent/10 text-accent'
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
        <input type="checkbox" checked={form.is_electric} onChange={(e) => setForm((f) => ({ ...f, is_electric: e.target.checked }))} className="accent-accent w-4 h-4" />
        Electric vehicle <span className="text-xs text-tertiary">— tracks charging in kWh</span>
      </label>
      {error && <p className="text-xs text-bad">{error}</p>}
    </Modal>
  )
}

export default function Garage() {
  const navigate = useNavigate()
  const { money, distance } = useSettings()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  // ?add=1 (the nav switcher's "Add a vehicle") opens the form on arrival.
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(() => params.get('add') === '1')

  const load = useCallback(async () => {
    setLoading(true)
    try { setVehicles(await getVehicles(true)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!params.get('add')) return
    const p = new URLSearchParams(params)
    p.delete('add')
    setParams(p, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = vehicles.filter((v) => !v.is_archived)
  const sold = vehicles.filter((v) => v.is_archived)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="title-lg">Garage</h1>
          <p className="text-sm text-secondary mt-0.5">
            {active.length} vehicle{active.length === 1 ? '' : 's'}
            {sold.length > 0 && ` · ${sold.length} sold`}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary flex-shrink-0"><Plus size={15} /> Add vehicle</button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 px-6 text-center">
          <span className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-4">
            <Car size={26} />
          </span>
          <p className="title-sm">No vehicles yet</p>
          <p className="text-sm text-secondary mt-1 max-w-xs">Add a car and MileMarker starts tracking fuel, service and what it all costs.</p>
          <button onClick={() => setAdding(true)} className="btn-primary mt-5"><Plus size={15} /> Add your first vehicle</button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((v) => (
              <div key={v.id} className="card p-4 relative group transition-shadow hover:shadow-pop dark:hover:bg-inset/60">
                {/* Stretched link: the whole card navigates, while quick actions sit above it. */}
                <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-2xl" />
                <div className="flex items-start gap-3">
                  <VehicleAvatar v={v} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{vehicleTitle(v)}</p>
                    <p className="text-xs text-tertiary truncate mt-0.5">
                      {v.license_plate || (v.is_electric ? 'Electric' : '\u00a0')}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-tertiary flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="flex items-end gap-4 mt-4">
                  <div className="min-w-0">
                    <p className="footnote">Odometer</p>
                    <p className="text-sm font-medium num mt-0.5">{distance(v.odometer)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="footnote">Spent</p>
                    <p className="text-sm font-medium num mt-0.5">{money(v.total_cost)}</p>
                  </div>
                  <span className="flex-1" />
                  <button
                    onClick={() => navigate(`/vehicle/${v.id}?tab=fuel&add=1`)}
                    className="btn-tinted relative z-10 -mb-0.5 h-8 px-3"
                    title={v.is_electric ? 'Log charge' : 'Log fuel'}
                    aria-label={`${v.is_electric ? 'Log charge' : 'Log fuel'} for ${vehicleTitle(v)}`}
                  >
                    {v.is_electric ? <Zap size={15} /> : <Fuel size={15} />}
                    <span className="hidden lg:inline">Log</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {sold.length > 0 && (
            <div className="mt-8">
              <p className="caption mb-3">Sold</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sold.map((v) => (
                  <div key={v.id} className="card p-4 relative group opacity-60 hover:opacity-100 transition-opacity">
                    <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-2xl" />
                    <div className="flex items-start gap-3">
                      <VehicleAvatar v={v} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{vehicleTitle(v)}</p>
                        <p className="text-xs text-tertiary truncate mt-0.5">
                          Sold{v.sold_date ? ` ${new Date(v.sold_date + 'T00:00:00').toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-tertiary flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-end gap-4 mt-4">
                      <div><p className="footnote">Odometer</p><p className="text-sm font-medium num mt-0.5">{distance(v.odometer)}</p></div>
                      <div><p className="footnote">Spent</p><p className="text-sm font-medium num mt-0.5">{money(v.total_cost)}</p></div>
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
