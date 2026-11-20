import React, { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Check, Plus, X, Download, Upload, Pencil, Monitor, SunMedium, MoonStar } from 'lucide-react'
import { updateSettings, getVehicles, getFuel, getRecords, getReminders, importLubeLogger, importCsv, createServiceType, updateServiceType, mergeServiceType, deleteServiceType, undoServiceTypeOp } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Item, ItemContent, ItemDescription, ItemActions } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

function SettingsCard({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent><FieldGroup className="gap-4">{children}</FieldGroup></CardContent>
    </Card>
  )
}

/* A settings row: label on the left, control on the right — the iOS layout,
   which stacks on narrow screens so long selects still have room. */
function SettingRow({ label, hint, htmlFor, children }) {
  const Label = htmlFor ? FieldLabel : FieldTitle
  return (
    <Field orientation="responsive" className="sm:gap-4">
      <FieldContent>
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <FieldDescription className="text-xs">{hint}</FieldDescription>}
      </FieldContent>
      <div className="sm:w-52 shrink-0">{children}</div>
    </Field>
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

  const chipAction = (label, onClick, icon) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost" size="icon-xs" onClick={onClick} disabled={busy}
            className="size-4 rounded-full [&_svg]:size-3" aria-label={label}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  const chip = (t, highlight) => (
    <Badge key={t.id} variant={highlight ? 'default' : 'secondary'} className="h-6 gap-1 pr-1.5 text-xs">
      {t.name}
      {t.record_count > 0 && <span className="opacity-70 tabular-nums">×{t.record_count}</span>}
      {t.needs_review === 1 && chipAction(`Keep ${t.name} as a type`, () => approve(t), <Check />)}
      {chipAction(`Rename or merge ${t.name}`, () => startEdit(t), <Pencil />)}
      {t.record_count === 0 && t.reminder_count === 0 && chipAction(`Delete ${t.name}`, () => setToDelete(t), <X />)}
    </Badge>
  )

  return (
    <SettingsCard
      title="Service types"
      description="One list, shared by service records and reminders. Typing a new name in those forms creates a type here; counts show how many records use each."
    >
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') add(draft) }}
          className="flex-1"
          placeholder="Add a service type…"
          aria-label="New service type"
        />
        <Button onClick={() => add(draft)} disabled={busy || !draft.trim()}><Plus /> Add</Button>
      </div>
      {error && <p className="text-xs text-destructive !mt-2">{error}</p>}
      {message && (
        <p className="text-xs text-success !mt-2 flex items-center gap-2">
          <Check size={12} className="shrink-0" /> {message.text}
          {message.undoId && (
            <Button variant="link" size="xs" onClick={undo} disabled={busy} className="h-auto p-0 text-xs shrink-0">
              Undo
            </Button>
          )}
        </p>
      )}

      {editing && (
        <Item variant="outline" size="sm" className="border-primary/40 bg-primary/5">
          <ItemContent>
          <ItemDescription className="line-clamp-none text-sm text-foreground">
            Rename <strong>{editing.name}</strong>
            {editing.record_count > 0 && <> — used by {editing.record_count} record{editing.record_count === 1 ? '' : 's'}</>}.
            Records and reminders follow automatically. Type an existing type's name to merge into it.
          </ItemDescription>
          <div className="flex gap-2 mt-2">
            <Input
              list="service-type-names" value={renameTo} autoFocus
              onChange={(e) => setRenameTo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setEditing(null) }}
              className="flex-1" aria-label="New name"
            />
            <datalist id="service-type-names">
              {serviceTypes.filter((t) => t.id !== editing.id).map((t) => <option key={t.id} value={t.name} />)}
            </datalist>
            <Button onClick={doRename} disabled={busy || !renameTo.trim() || renameTo.trim() === editing.name}>
              {busy ? <><Spinner /> Saving…</> : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
          <Label className="text-xs font-normal text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c)} />
            Map future imports of “{editing.name}” to the new name
          </Label>
          </ItemContent>
        </Item>
      )}

      {needsReview.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1.5">New from imports — review these</p>
          <div className="flex flex-wrap gap-1.5">
            {needsReview.map((t) => chip(t, true))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Keep one as its own type (✓), or rename it (✏️) into a type you already use — that re-tags its records,
            and the old spelling is remembered so future imports map correctly on their own.
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-1.5">All types</p>
        <div className="flex flex-wrap gap-1.5">
          {reviewed.map((t) => chip(t, false))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
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
        <Button nativeButton={false} render={<a href="/api/backup/download" />}>
          <Download /> Download backup
        </Button>
        <Button variant="ghost" onClick={exportAll} disabled={exporting}>
          {exporting ? <><Spinner /> Exporting…</> : 'Export JSON'}
        </Button>
        <div className="flex-1" />
        <input ref={restoreRef} type="file" accept=".zip,application/zip" hidden
          onChange={(e) => setRestoreFile(e.target.files[0] || null)} />
        <Button variant="ghost" onClick={() => restoreRef.current?.click()} disabled={restoring} className="text-warning hover:text-warning">
          <Upload /> Restore backup…
        </Button>
      </div>

      {restoreFile && (
        <Item variant="outline" size="sm" className="border-warning/40 bg-warning/10">
          <ItemContent>
          <ItemDescription className="line-clamp-none text-sm text-warning">
            Restore <strong>{restoreFile.name}</strong>? This <strong>replaces all current data</strong> — vehicles, records, and attachments — with the backup's contents.
          </ItemDescription>
          </ItemContent>
          <ItemActions className="w-full">
            <Button variant="destructive" onClick={doRestore} disabled={restoring}>
              {restoring ? <><Spinner /> Restoring…</> : 'Yes, replace everything'}
            </Button>
            <Button variant="ghost" onClick={() => { setRestoreFile(null); if (restoreRef.current) restoreRef.current.value = '' }}>Cancel</Button>
          </ItemActions>
        </Item>
      )}
      {restored && <p className="text-sm text-success flex items-center gap-1.5"><Check size={14} /> Restored — reloading…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">JSON export is readable everywhere but doesn't include attachments; the zip backup includes everything and can be restored here.</p>
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
        <Field className="flex-1 min-w-[160px] gap-1.5">
          <FieldLabel htmlFor="csv-vehicle">Into vehicle</FieldLabel>
          <NativeSelect id="csv-vehicle" className="w-full" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => <NativeSelectOption key={v.id} value={v.id}>{vehicleLabel(v)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files[0])} />
        <Button onClick={() => inputRef.current?.click()} disabled={busy || !vehicleId}>
          {busy ? <Spinner /> : <Upload />} {busy ? 'Importing…' : 'Choose CSV'}
        </Button>
      </div>

      {result && (
        <p className="text-sm text-success flex items-center gap-1.5">
          <Check size={14} />
          {counts.length === 0 ? 'Nothing new to import.' : `Imported ${counts.map(([l, n]) => `${n} ${l}${n === 1 ? '' : 's'}`).join(', ')}.`}
          {result.skipped_duplicates > 0 && <span className="text-muted-foreground"> {result.skipped_duplicates} duplicate{result.skipped_duplicates === 1 ? '' : 's'} skipped.</span>}
        </p>
      )}
      {error && <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>}

      <Item variant="muted" size="sm" className="text-xs text-muted-foreground">
        <ItemContent className="gap-1.5">
        <p className="font-medium text-foreground">Reading receipts with Claude</p>
        <p>
          There's no AI built into MileMarker — instead, a ready-made skill teaches Claude to turn photos of your
          car receipts into this CSV. Install it, then give Claude your receipt photos in any session and ask it to
          log them for MileMarker; it extracts each record, asks for odometer readings on fuel receipts, and hands
          back a CSV to import here.
        </p>
        <p>
          <Button variant="link" nativeButton={false} render={<a href="/milemarker-receipts-skill.md" download="SKILL.md" />} className="h-auto p-0 text-xs">
            Download the skill
          </Button>
          {' '}and save it as <code>~/.claude/skills/milemarker-receipts/SKILL.md</code> (Claude Code), or add it to a
          Claude project's knowledge.
        </p>
        </ItemContent>
      </Item>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">CSV format</summary>
        <div className="mt-2 space-y-2">
          <p>
            Columns: <code>type</code> (fuel / service / repair / upgrade / odometer), <code>date</code> (YYYY-MM-DD),{' '}
            <code>odometer</code>, <code>description</code> (multiple items separated by <code>;</code>),{' '}
            <code>quantity</code> (fuel volume), <code>cost</code>, <code>is_fill_to_full</code>, <code>missed_fuelup</code>, <code>notes</code>.
            Fuel rows need odometer, quantity, and cost. An optional <code>vehicle</code> column (nickname, plate, or "year make model") overrides the vehicle picked above.
            Re-importing the same rows won't create duplicates.
          </p>
          <pre className="p-2 rounded-lg bg-muted overflow-x-auto">{CSV_TEMPLATE}</pre>
          <Button
            variant="link" nativeButton={false} className="h-auto p-0 text-xs"
            render={<a href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`} download="milemarker-template.csv" />}
          >
            Download template
          </Button>
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
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Spinner /> : <Upload />} {busy ? 'Importing…' : 'Choose LubeLogger folder'}
      </Button>

      {result && (
        <div className="text-sm space-y-1">
          <p className="text-success flex items-center gap-1.5">
            <Check size={14} />
            {counts.length === 0
              ? 'Nothing new to import.'
              : `Imported ${counts.map(([label, n]) => `${n} ${label}${n === 1 ? '' : 's'}`).join(', ')}.`}
          </p>
          {result.skipped_vehicles?.length > 0 && (
            <p className="text-xs text-muted-foreground">Already here (skipped): {result.skipped_vehicles.join('; ')}</p>
          )}
          {result.missing_files?.length > 0 && (
            <p className="text-xs text-warning">Files referenced but not found in the folder: {result.missing_files.join(', ')}</p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </SettingsCard>
  )
}

export default function Settings() {
  const { setCrumb } = useOutletContext()
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

  const SelectField = ({ label, hint, k, options }) => (
    <SettingRow label={label} hint={hint} htmlFor={`setting-${k}`}>
      <NativeSelect id={`setting-${k}`} className="w-full" value={settings[k]} onChange={(e) => save({ [k]: e.target.value })}>
        {options.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
      </NativeSelect>
    </SettingRow>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        {saved && (
          <Badge className="bg-success/15 text-success animate-in fade-in-0"><Check /> Saved</Badge>
        )}
      </div>

      <SettingsCard title="Units & display">
        <SelectField label="Distance unit" k="distance_unit" options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]} />
        <SelectField label="Volume unit" k="volume_unit" options={[{ value: 'gal', label: 'Gallons' }, { value: 'L', label: 'Litres' }]} />
        <SelectField label="Currency symbol" k="currency_symbol" options={[{ value: '$', label: '$ (USD/CAD/AUD)' }, { value: '€', label: '€ (EUR)' }, { value: '£', label: '£ (GBP)' }]} />
        <SettingRow label="Appearance" hint={theme === 'system' ? `Following your device — currently ${resolved}` : null}>
          <Tabs value={theme} onValueChange={setTheme} className="w-full">
            <TabsList className="w-full">
              {[
                { v: 'system', label: 'System', icon: Monitor },
                { v: 'light', label: 'Light', icon: SunMedium },
                { v: 'dark', label: 'Dark', icon: MoonStar },
              ].map((o) => (
                <TabsTrigger key={o.v} value={o.v} className="flex-1 px-2" aria-label={o.label}>
                  <o.icon size={13} className="shrink-0" />
                  <span className="hidden sm:inline">{o.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </SettingRow>
      </SettingsCard>

      <ServiceTypes />
      <CsvImportCard />
      <ImportCard />
      <DataCard />

      <p className="text-xs text-muted-foreground text-center pt-2 pb-4">MileMarker v{settings.version || '—'}</p>
    </div>
  )
}
