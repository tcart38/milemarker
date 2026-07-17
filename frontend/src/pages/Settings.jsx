import React, { useState, useEffect, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Check, Plus, X, Download, Upload, ArrowLeft, Pencil } from 'lucide-react'
import { updateSettings, getVehicles, getFuel, getRecords, getReminders, importLubeLogger, importCsv, getServiceTypeUsage, renameServiceType } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { PRESETS } from '../presets.js'

function SettingsCard({ title, description, children }) {
  return (
    <div className="card p-4">
      <p className="stat-label">{title}</p>
      {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  )
}

function ServiceTypes() {
  const { customServices, addCustomService, removeCustomService, renameCustomService } = useSettings()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState([]) // [{ name, count }] from service records
  const [editing, setEditing] = useState(null)
  const [renameTo, setRenameTo] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renamed, setRenamed] = useState(null)

  const refreshUsage = () => getServiceTypeUsage().then(setUsage).catch(() => {})
  useEffect(() => { refreshUsage() }, [])

  const lc = (s) => s.toLowerCase()
  const listed = new Set([...PRESETS.service, ...customServices].map(lc))
  const countFor = (name) => usage.find((u) => lc(u.name) === lc(name))?.count || 0

  const add = async (name) => {
    name = name.trim()
    if (!name) return
    const exists = [...PRESETS.service, ...customServices].some((s) => lc(s) === lc(name))
    if (exists) { setError(`“${name}” already exists.`); return }
    setError(null)
    await addCustomService(name)
    setDraft('')
  }

  const startRename = (name) => {
    setEditing(name); setRenameTo(name); setRenamed(null); setError(null)
  }

  const doRename = async () => {
    const from = editing, to = renameTo.trim()
    if (!to || to === from) { setEditing(null); return }
    setRenaming(true); setError(null)
    try {
      const result = await renameServiceType(from, to)
      await renameCustomService(from, to)
      await refreshUsage()
      const parts = [`${result.records} record${result.records === 1 ? '' : 's'}`]
      if (result.reminders > 0) parts.push(`${result.reminders} reminder${result.reminders === 1 ? '' : 's'}`)
      setRenamed(`Renamed “${from}” to “${to}” — ${parts.join(' and ')} updated.`)
      setEditing(null)
    } catch (err) { setError(err.message) } finally { setRenaming(false) }
  }

  const editButton = (name) => (
    <button
      onClick={() => startRename(name)}
      className="p-0.5 rounded-full hover:bg-brand/20"
      title={`Rename or merge ${name}`} aria-label={`Rename or merge ${name}`}
    >
      <Pencil size={11} />
    </button>
  )

  return (
    <SettingsCard
      title="Service types"
      description="Offered when logging service records and creating reminders. You can always type something custom in those forms — new names are saved here."
    >
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') add(draft) }}
          className="input flex-1"
          placeholder="Add a service type…"
          aria-label="New service type"
        />
        <button onClick={() => add(draft)} disabled={!draft.trim()} className="btn-primary disabled:opacity-50"><Plus size={14} /> Add</button>
      </div>
      {error && <p className="text-xs text-red-500 !mt-2">{error}</p>}
      {renamed && <p className="text-xs text-emerald-500 !mt-2 flex items-center gap-1"><Check size={12} /> {renamed}</p>}

      {editing && (
        <div className="rounded-lg border border-brand/40 bg-brand/5 p-3 space-y-2">
          <p className="text-sm">
            Rename <strong>{editing}</strong> everywhere{countFor(editing) > 0 && <> — used by {countFor(editing)} record{countFor(editing) === 1 ? '' : 's'}</>}.
            Records and matching reminders are updated. Pick an existing type to merge into it.
          </p>
          <div className="flex gap-2">
            <input
              list="service-type-names" value={renameTo} autoFocus
              onChange={(e) => setRenameTo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setEditing(null) }}
              className="input flex-1" aria-label="New name"
            />
            <datalist id="service-type-names">
              {[...new Set([...PRESETS.service, ...customServices, ...usage.map((u) => u.name)])]
                .filter((n) => n !== editing).map((n) => <option key={n} value={n} />)}
            </datalist>
            <button onClick={doRename} disabled={renaming || !renameTo.trim() || renameTo.trim() === editing} className="btn-primary disabled:opacity-50">
              {renaming ? 'Renaming…' : 'Rename'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {customServices.length > 0 && (
        <div>
          <p className="label">Your custom types</p>
          <div className="flex flex-wrap gap-1.5">
            {customServices.map((s) => (
              <span key={s} className="chip chip-on !cursor-default gap-1 pr-1.5">
                {s}
                {editButton(s)}
                <button
                  onClick={() => removeCustomService(s)}
                  className="p-0.5 rounded-full hover:bg-brand/20"
                  title={`Remove ${s}`} aria-label={`Remove ${s}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Removing a type doesn't change records or reminders that already use it.</p>
        </div>
      )}

      {usage.length > 0 && (
        <div>
          <p className="label">Found in your records</p>
          <div className="flex flex-wrap gap-1.5">
            {[...usage]
              .sort((a, b) => (listed.has(lc(a.name)) ? 1 : 0) - (listed.has(lc(b.name)) ? 1 : 0) || b.count - a.count || a.name.localeCompare(b.name))
              .map((u) => {
                const isListed = listed.has(lc(u.name))
                return (
                  <span key={u.name} className={`chip ${isListed ? 'chip-off' : 'chip-on'} !cursor-default gap-1 pr-1.5`}>
                    {isListed && <Check size={11} className="text-emerald-500" />}
                    {u.name} <span className="text-slate-400 tabular-nums">×{u.count}</span>
                    {editButton(u.name)}
                    {!isListed && (
                      <button
                        onClick={() => add(u.name)}
                        className="p-0.5 rounded-full hover:bg-brand/20"
                        title={`Add ${u.name} to your list`} aria-label={`Add ${u.name} to your list`}
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </span>
                )
              })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Every service type used by your records. <Check size={10} className="inline text-emerald-500" /> = already
            a type in your list. The highlighted rest — usually import spellings — can be added to your list as-is
            (＋) or renamed (✏️) into a type you already use, which re-tags those records.
          </p>
        </div>
      )}

      <div>
        <p className="label">Built-in types</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.service.map((s) => <span key={s} className="chip chip-off !cursor-default">{s}</span>)}
        </div>
      </div>
    </SettingsCard>
  )
}

function DataCard() {
  const { settings } = useSettings()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const restoreRef = useRef(null)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)

  const doRestore = async () => {
    setRestoring(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', restoreFile)
      const res = await fetch('/api/backup/restore', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRestored(true)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) { setError(err.message) } finally {
      setRestoring(false); setRestoreFile(null)
      if (restoreRef.current) restoreRef.current.value = ''
    }
  }

  const exportAll = async () => {
    setExporting(true); setError(null)
    try {
      const vehicles = await getVehicles()
      const full = {
        exported_at: new Date().toISOString(),
        app: `MileMarker v${settings.version || '?'}`,
        settings: { ...settings, version: undefined },
        vehicles: [],
      }
      for (const v of vehicles) {
        const [fuel, service, repair, upgrade, odometer, reminders] = await Promise.all([
          getFuel(v.id),
          getRecords(v.id, 'service'), getRecords(v.id, 'repair'), getRecords(v.id, 'upgrade'),
          getRecords(v.id, 'odometer'), getReminders(v.id),
        ])
        full.vehicles.push({ ...v, fuel, service, repair, upgrade, odometer_readings: odometer, reminders })
      }
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `milemarker-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) { setError(err.message) } finally { setExporting(false) }
  }

  return (
    <SettingsCard title="Data" description="Back up everything — database and all attachments — as one zip. Restore replaces the current data with a backup.">
      <div className="flex flex-wrap gap-2">
        <a href="/api/backup/download" className="btn-primary">
          <Download size={14} /> Download backup
        </a>
        <button onClick={exportAll} disabled={exporting} className="btn-ghost">
          {exporting ? 'Exporting…' : 'Export JSON'}
        </button>
        <div className="flex-1" />
        <input ref={restoreRef} type="file" accept=".zip,application/zip" hidden
          onChange={(e) => setRestoreFile(e.target.files[0] || null)} />
        <button onClick={() => restoreRef.current?.click()} disabled={restoring} className="btn-ghost text-amber-500 hover:text-amber-500">
          <Upload size={14} /> Restore backup…
        </button>
      </div>

      {restoreFile && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Restore <strong>{restoreFile.name}</strong>? This <strong>replaces all current data</strong> — vehicles, records, and attachments — with the backup's contents.
          </p>
          <div className="flex gap-2">
            <button onClick={doRestore} disabled={restoring} className="btn-danger disabled:opacity-50">
              {restoring ? 'Restoring…' : 'Yes, replace everything'}
            </button>
            <button onClick={() => { setRestoreFile(null); if (restoreRef.current) restoreRef.current.value = '' }} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}
      {restored && <p className="text-sm text-emerald-500 flex items-center gap-1.5"><Check size={14} /> Restored — reloading…</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-[11px] text-slate-400">JSON export is readable everywhere but doesn't include attachments; the zip backup includes everything and can be restored here.</p>
    </SettingsCard>
  )
}

const CSV_TEMPLATE = `type,date,odometer,description,quantity,cost,is_fill_to_full,missed_fuelup,notes
fuel,2026-07-01,52100,,12.42,44.87,true,false,
service,2026-07-03,52210,Oil change; Tire rotation,,89.50,,,Jiffy Lube
repair,2026-06-15,,Brake repair,,320.00,,,front pads and rotors
odometer,2026-07-10,52400,,,,,,
`

function vehicleLabel(v) {
  return v.name || [v.year, v.make, v.model].filter(Boolean).join(' ') || `Vehicle ${v.id}`
}

function CsvImportCard() {
  const inputRef = useRef(null)
  const [vehicles, setVehicles] = useState([])
  const [vehicleId, setVehicleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getVehicles().then((vs) => {
      setVehicles(vs)
      if (vs.length > 0) setVehicleId(String(vs[0].id))
    })
  }, [])

  const onFile = async (file) => {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try { setResult(await importCsv(vehicleId, file)) }
    catch (err) { setError(err.message) }
    finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const counts = result && [
    ['fill-up', result.fuel], ['service record', result.service], ['repair', result.repair],
    ['upgrade', result.upgrade], ['odometer reading', result.odometer],
  ].filter(([, n]) => n > 0)

  return (
    <SettingsCard
      title="Import records from CSV"
      description="One row per record. Tip: photograph your receipts, ask Claude to fill out the CSV using the format below, then import it here."
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Into vehicle</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="input">
            {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
          </select>
        </div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files[0])} />
        <button onClick={() => inputRef.current?.click()} disabled={busy || !vehicleId} className="btn-primary disabled:opacity-50">
          <Upload size={14} /> {busy ? 'Importing…' : 'Choose CSV'}
        </button>
      </div>

      {result && (
        <p className="text-sm text-emerald-500 flex items-center gap-1.5">
          <Check size={14} />
          {counts.length === 0 ? 'Nothing new to import.' : `Imported ${counts.map(([l, n]) => `${n} ${l}${n === 1 ? '' : 's'}`).join(', ')}.`}
          {result.skipped_duplicates > 0 && <span className="text-slate-400"> {result.skipped_duplicates} duplicate{result.skipped_duplicates === 1 ? '' : 's'} skipped.</span>}
        </p>
      )}
      {error && <p className="text-xs text-red-500 whitespace-pre-wrap">{error}</p>}

      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <p className="font-medium text-slate-700 dark:text-slate-200">Reading receipts with Claude</p>
        <p>
          There's no AI built into MileMarker — instead, a ready-made skill teaches Claude to turn photos of your
          car receipts into this CSV. Install it, then give Claude your receipt photos in any session and ask it to
          log them for MileMarker; it extracts each record, asks for odometer readings on fuel receipts, and hands
          back a CSV to import here.
        </p>
        <p>
          <a href="/milemarker-receipts-skill.md" download="SKILL.md" className="text-brand hover:underline">
            Download the skill
          </a>
          {' '}and save it as <code>~/.claude/skills/milemarker-receipts/SKILL.md</code> (Claude Code), or add it to a
          Claude project's knowledge.
        </p>
      </div>

      <details className="text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer select-none">CSV format</summary>
        <div className="mt-2 space-y-2">
          <p>
            Columns: <code>type</code> (fuel / service / repair / upgrade / odometer), <code>date</code> (YYYY-MM-DD),{' '}
            <code>odometer</code>, <code>description</code> (multiple items separated by <code>;</code>),{' '}
            <code>quantity</code> (fuel volume), <code>cost</code>, <code>is_fill_to_full</code>, <code>missed_fuelup</code>, <code>notes</code>.
            Fuel rows need odometer, quantity, and cost. An optional <code>vehicle</code> column (nickname, plate, or "year make model") overrides the vehicle picked above.
            Re-importing the same rows won't create duplicates.
          </p>
          <pre className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/60 overflow-x-auto">{CSV_TEMPLATE}</pre>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
            download="milemarker-template.csv"
            className="text-brand hover:underline"
          >
            Download template
          </a>
        </div>
      </details>
    </SettingsCard>
  )
}

function ImportCard() {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const onFiles = async (fileList) => {
    const files = [...fileList]
    if (files.length === 0) return
    setBusy(true); setError(null); setResult(null)
    try {
      setResult(await importLubeLogger(files))
    } catch (err) { setError(err.message) } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = '' // allow re-selecting the same folder
    }
  }

  const counts = result && [
    ['vehicle', result.vehicles], ['fill-up', result.fuel], ['service record', result.service],
    ['repair', result.repair], ['upgrade', result.upgrade], ['odometer reading', result.odometer],
    ['reminder', result.reminders], ['attachment', result.attachments],
  ].filter(([, n]) => n > 0)

  return (
    <SettingsCard
      title="Import from LubeLogger"
      description="Select your whole LubeLogger appdata folder (the one containing data/cartracker.db). Vehicles, fuel, service history, reminders, and attached images/documents come across. Vehicles that already exist here are skipped."
    >
      <input
        ref={inputRef} type="file" webkitdirectory="" multiple hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn-primary disabled:opacity-50">
        <Upload size={14} /> {busy ? 'Importing…' : 'Choose LubeLogger folder'}
      </button>

      {result && (
        <div className="text-sm space-y-1">
          <p className="text-emerald-500 flex items-center gap-1.5">
            <Check size={14} />
            {counts.length === 0
              ? 'Nothing new to import.'
              : `Imported ${counts.map(([label, n]) => `${n} ${label}${n === 1 ? '' : 's'}`).join(', ')}.`}
          </p>
          {result.skipped_vehicles?.length > 0 && (
            <p className="text-xs text-slate-400">Already here (skipped): {result.skipped_vehicles.join('; ')}</p>
          )}
          {result.missing_files?.length > 0 && (
            <p className="text-xs text-amber-500">Files referenced but not found in the folder: {result.missing_files.join(', ')}</p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </SettingsCard>
  )
}

export default function Settings() {
  const { setCrumb } = useOutletContext()
  const navigate = useNavigate()
  const { settings, setSettings, refresh } = useSettings()
  const { theme, setTheme } = useTheme()
  const [saved, setSaved] = useState(false)

  useEffect(() => { setCrumb('Settings'); return () => setCrumb(null) }, [setCrumb])

  const save = async (patch) => {
    const updated = await updateSettings(patch)
    setSettings((s) => ({ ...s, ...updated }))
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const Field = ({ label, k, options }) => (
    <div>
      <label className="label">{label}</label>
      <select value={settings[k]} onChange={(e) => save({ [k]: e.target.value })} className="input max-w-xs">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/garage'))}
          className="btn-ghost -ml-2" title="Back" aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
        {saved && <span className="text-xs text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
      </div>

      <SettingsCard title="Units & display">
        <Field label="Distance unit" k="distance_unit" options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]} />
        <Field label="Volume unit" k="volume_unit" options={[{ value: 'gal', label: 'Gallons' }, { value: 'L', label: 'Litres' }]} />
        <Field label="Currency symbol" k="currency_symbol" options={[{ value: '$', label: '$ (USD/CAD/AUD)' }, { value: '€', label: '€ (EUR)' }, { value: '£', label: '£ (GBP)' }]} />
        <div>
          <label className="label">Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="input max-w-xs">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </SettingsCard>

      <ServiceTypes />
      <CsvImportCard />
      <ImportCard />
      <DataCard />

      <p className="text-xs text-slate-400 dark:text-slate-500">MileMarker v{settings.version || '—'}</p>
    </div>
  )
}
