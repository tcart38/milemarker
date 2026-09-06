import React, { useState, useEffect, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Check, Plus, X, Download, Upload, ArrowLeft, Pencil, Monitor, SunMedium, MoonStar } from 'lucide-react'
import { updateSettings, getVehicles, getFuel, getRecords, getReminders, importLubeLogger, importCsv, createServiceType, updateServiceType, mergeServiceType, deleteServiceType, undoServiceTypeOp } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

function SettingsCard({ title, description, children }) {
  return (
    <section>
      <h2 className="caption px-1 mb-2">{title}</h2>
      <div className="card p-4 sm:p-5">
        {description && <p className="text-sm text-secondary -mt-0.5 mb-3">{description}</p>}
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  )
}

/* A settings row: label on the left, control on the right — the iOS layout,
   which stacks on narrow screens so long selects still have room. */
function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
      <div className="min-w-0 sm:flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="footnote mt-0.5">{hint}</p>}
      </div>
      <div className="sm:w-52 flex-shrink-0">{children}</div>
    </div>
  )
}

function ServiceTypes() {
  const { serviceTypes, refreshServiceTypes } = useSettings()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // type object being renamed/merged
  const [renameTo, setRenameTo] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { text, undoId? }

  const lc = (s) => s.toLowerCase()
  const needsReview = serviceTypes.filter((t) => t.needs_review)
  const reviewed = serviceTypes.filter((t) => !t.needs_review)

  const run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn(); await refreshServiceTypes() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const add = (name) => run(async () => {
    name = name.trim()
    if (!name) return
    await createServiceType(name)
    setDraft(''); setMessage(null)
  })

  const approve = (t) => run(async () => {
    await updateServiceType(t.id, { needs_review: false })
    setMessage({ text: `Kept “${t.name}” as a type.` })
  })

  const [toDelete, setToDelete] = useState(null)
  const remove = (t) => run(async () => {
    await deleteServiceType(t.id)
    setMessage({ text: `Deleted “${t.name}”.` })
  })

  const startEdit = (t) => { setEditing(t); setRenameTo(t.name); setRemember(true); setMessage(null); setError(null) }

  // One editor for both: typing an existing type's name merges into it.
  const doRename = () => run(async () => {
    const to = renameTo.trim()
    if (!to || to === editing.name) { setEditing(null); return }
    const target = serviceTypes.find((t) => t.id !== editing.id && lc(t.name) === lc(to))
    const result = target
      ? await mergeServiceType(editing.id, target.id, remember)
      : await updateServiceType(editing.id, { name: to, remember })
    const parts = []
    if (result.records > 0) parts.push(`${result.records} record${result.records === 1 ? '' : 's'}`)
    if (result.reminders > 0) parts.push(`${result.reminders} reminder${result.reminders === 1 ? '' : 's'}`)
    const tail = parts.length > 0 ? ` — ${parts.join(' and ')} updated` : ''
    setMessage({
      text: target
        ? `Merged “${editing.name}” into “${target.name}”${tail}.${remember ? ` Future imports of “${editing.name}” map there automatically.` : ''}`
        : `Renamed “${editing.name}” to “${to}”${tail}.`,
      undoId: result.undo_id,
    })
    setEditing(null)
  })

  const undo = () => run(async () => {
    await undoServiceTypeOp(message.undoId)
    setMessage({ text: 'Undone.' })
  })

  const chip = (t, highlight) => (
    <span key={t.id} className={`chip ${highlight ? 'chip-on' : 'chip-off'} !cursor-default gap-1 pr-1.5`}>
      {t.name}
      {t.record_count > 0 && <span className="text-tertiary tabular-nums">×{t.record_count}</span>}
      {t.needs_review === 1 && (
        <button
          onClick={() => approve(t)} disabled={busy}
          className="p-0.5 rounded-full hover:bg-accent/20"
          title={`Keep ${t.name} as a type`} aria-label={`Keep ${t.name} as a type`}
        >
          <Check size={12} />
        </button>
      )}
      <button
        onClick={() => startEdit(t)} disabled={busy}
        className="p-0.5 rounded-full hover:bg-accent/20"
        title={`Rename or merge ${t.name}`} aria-label={`Rename or merge ${t.name}`}
      >
        <Pencil size={11} />
      </button>
      {t.record_count === 0 && t.reminder_count === 0 && (
        <button
          onClick={() => setToDelete(t)} disabled={busy}
          className="p-0.5 rounded-full hover:bg-accent/20"
          title={`Delete ${t.name}`} aria-label={`Delete ${t.name}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  )

  return (
    <SettingsCard
      title="Service types"
      description="One list, shared by service records and reminders. Typing a new name in those forms creates a type here; counts show how many records use each."
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
        <button onClick={() => add(draft)} disabled={busy || !draft.trim()} className="btn-primary disabled:opacity-50"><Plus size={14} /> Add</button>
      </div>
      {error && <p className="text-xs text-bad !mt-2">{error}</p>}
      {message && (
        <p className="text-xs text-ok !mt-2 flex items-center gap-2">
          <Check size={12} className="shrink-0" /> {message.text}
          {message.undoId && (
            <button onClick={undo} disabled={busy} className="underline hover:no-underline text-accent shrink-0">
              Undo
            </button>
          )}
        </p>
      )}

      {editing && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
          <p className="text-sm">
            Rename <strong>{editing.name}</strong>
            {editing.record_count > 0 && <> — used by {editing.record_count} record{editing.record_count === 1 ? '' : 's'}</>}.
            Records and reminders follow automatically. Type an existing type's name to merge into it.
          </p>
          <div className="flex gap-2">
            <input
              list="service-type-names" value={renameTo} autoFocus
              onChange={(e) => setRenameTo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setEditing(null) }}
              className="input flex-1" aria-label="New name"
            />
            <datalist id="service-type-names">
              {serviceTypes.filter((t) => t.id !== editing.id).map((t) => <option key={t.id} value={t.name} />)}
            </datalist>
            <button onClick={doRename} disabled={busy || !renameTo.trim() || renameTo.trim() === editing.name} className="btn-primary disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-secondary">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-accent w-3.5 h-3.5" />
            Map future imports of “{editing.name}” to the new name
          </label>
        </div>
      )}

      {needsReview.length > 0 && (
        <div>
          <p className="label">New from imports — review these</p>
          <div className="flex flex-wrap gap-1.5">
            {needsReview.map((t) => chip(t, true))}
          </div>
          <p className="text-xs text-tertiary mt-2">
            Keep one as its own type (✓), or rename it (✏️) into a type you already use — that re-tags its records,
            and the old spelling is remembered so future imports map correctly on their own.
          </p>
        </div>
      )}

      <div>
        <p className="label">All types</p>
        <div className="flex flex-wrap gap-1.5">
          {reviewed.map((t) => chip(t, false))}
        </div>
        <p className="text-xs text-tertiary mt-2">
          Unused types can be deleted (✕); types in use can be renamed or merged instead, which updates their records.
        </p>
      </div>
      {toDelete && (
        <ConfirmDialog
          message={`Delete the “${toDelete.name}” service type?`}
          onConfirm={async () => { await remove(toDelete); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        />
      )}
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
        <button onClick={() => restoreRef.current?.click()} disabled={restoring} className="btn-ghost text-warn hover:text-warn">
          <Upload size={14} /> Restore backup…
        </button>
      </div>

      {restoreFile && (
        <div className="rounded-lg border border-warn/40 bg-warn/[0.06] p-3 space-y-2">
          <p className="text-sm text-warn">
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
      {restored && <p className="text-sm text-ok flex items-center gap-1.5"><Check size={14} /> Restored — reloading…</p>}
      {error && <p className="text-xs text-bad">{error}</p>}
      <p className="text-xs text-tertiary">JSON export is readable everywhere but doesn't include attachments; the zip backup includes everything and can be restored here.</p>
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
        <p className="text-sm text-ok flex items-center gap-1.5">
          <Check size={14} />
          {counts.length === 0 ? 'Nothing new to import.' : `Imported ${counts.map(([l, n]) => `${n} ${l}${n === 1 ? '' : 's'}`).join(', ')}.`}
          {result.skipped_duplicates > 0 && <span className="text-tertiary"> {result.skipped_duplicates} duplicate{result.skipped_duplicates === 1 ? '' : 's'} skipped.</span>}
        </p>
      )}
      {error && <p className="text-xs text-bad whitespace-pre-wrap">{error}</p>}

      <div className="rounded-lg bg-inset border border-hairline/50 p-3 text-xs text-secondary space-y-1.5">
        <p className="font-medium text-primary">Reading receipts with Claude</p>
        <p>
          There's no AI built into MileMarker — instead, a ready-made skill teaches Claude to turn photos of your
          car receipts into this CSV. Install it, then give Claude your receipt photos in any session and ask it to
          log them for MileMarker; it extracts each record, asks for odometer readings on fuel receipts, and hands
          back a CSV to import here.
        </p>
        <p>
          <a href="/milemarker-receipts-skill.md" download="SKILL.md" className="text-accent hover:underline">
            Download the skill
          </a>
          {' '}and save it as <code>~/.claude/skills/milemarker-receipts/SKILL.md</code> (Claude Code), or add it to a
          Claude project's knowledge.
        </p>
      </div>

      <details className="text-xs text-secondary">
        <summary className="cursor-pointer select-none">CSV format</summary>
        <div className="mt-2 space-y-2">
          <p>
            Columns: <code>type</code> (fuel / service / repair / upgrade / odometer), <code>date</code> (YYYY-MM-DD),{' '}
            <code>odometer</code>, <code>description</code> (multiple items separated by <code>;</code>),{' '}
            <code>quantity</code> (fuel volume), <code>cost</code>, <code>is_fill_to_full</code>, <code>missed_fuelup</code>, <code>notes</code>.
            Fuel rows need odometer, quantity, and cost. An optional <code>vehicle</code> column (nickname, plate, or "year make model") overrides the vehicle picked above.
            Re-importing the same rows won't create duplicates.
          </p>
          <pre className="p-2 rounded-lg bg-inset overflow-x-auto">{CSV_TEMPLATE}</pre>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
            download="milemarker-template.csv"
            className="text-accent hover:underline"
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
          <p className="text-ok flex items-center gap-1.5">
            <Check size={14} />
            {counts.length === 0
              ? 'Nothing new to import.'
              : `Imported ${counts.map(([label, n]) => `${n} ${label}${n === 1 ? '' : 's'}`).join(', ')}.`}
          </p>
          {result.skipped_vehicles?.length > 0 && (
            <p className="text-xs text-tertiary">Already here (skipped): {result.skipped_vehicles.join('; ')}</p>
          )}
          {result.missing_files?.length > 0 && (
            <p className="text-xs text-warn">Files referenced but not found in the folder: {result.missing_files.join(', ')}</p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </SettingsCard>
  )
}

export default function Settings() {
  const { setCrumb } = useOutletContext()
  const navigate = useNavigate()
  const { settings, setSettings, refresh } = useSettings()
  const { theme, resolved, setTheme } = useTheme()
  const [saved, setSaved] = useState(false)

  useEffect(() => { setCrumb('Settings'); return () => setCrumb(null) }, [setCrumb])

  const save = async (patch) => {
    const updated = await updateSettings(patch)
    setSettings((s) => ({ ...s, ...updated }))
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const Field = ({ label, hint, k, options }) => (
    <SettingRow label={label} hint={hint}>
      <select value={settings[k]} onChange={(e) => save({ [k]: e.target.value })} className="input">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </SettingRow>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/garage'))}
          className="btn-icon -ml-2" title="Back" aria-label="Back"
        >
          <ArrowLeft size={17} />
        </button>
        <h1 className="title-lg">Settings</h1>
        {saved && (
          <span className="badge badge-service animate-fade"><Check size={12} /> Saved</span>
        )}
      </div>

      <SettingsCard title="Units & display">
        <Field label="Distance unit" k="distance_unit" options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]} />
        <Field label="Volume unit" k="volume_unit" options={[{ value: 'gal', label: 'Gallons' }, { value: 'L', label: 'Litres' }]} />
        <Field label="Currency symbol" k="currency_symbol" options={[{ value: '$', label: '$ (USD/CAD/AUD)' }, { value: '€', label: '€ (EUR)' }, { value: '£', label: '£ (GBP)' }]} />
        <SettingRow label="Appearance" hint={theme === 'system' ? `Following your device — currently ${resolved}` : null}>
          <div className="segmented w-full">
            {[
              { v: 'system', label: 'System', icon: Monitor },
              { v: 'light', label: 'Light', icon: SunMedium },
              { v: 'dark', label: 'Dark', icon: MoonStar },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setTheme(o.v)}
                aria-pressed={theme === o.v}
                className={`segment flex-1 px-2 ${theme === o.v ? 'segment-on' : ''}`}
              >
                <o.icon size={13} className="flex-shrink-0" />
                <span className="hidden xs:inline sm:inline">{o.label}</span>
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsCard>

      <ServiceTypes />
      <CsvImportCard />
      <ImportCard />
      <DataCard />

      <p className="footnote text-center pt-2 pb-4">MileMarker v{settings.version || '—'}</p>
    </div>
  )
}
