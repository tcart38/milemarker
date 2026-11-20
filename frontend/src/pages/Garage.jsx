import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Car, Fuel, Zap, ChevronRight } from 'lucide-react'
import { getVehicles, createVehicle, attachmentUrl } from '../api/client.js'
import { useSettings } from '../context/SettingsContext.jsx'
import Modal from '../components/Modal.jsx'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { vehicleTitle } from '../vehicles.js'

function VehicleAvatar({ v }) {
  return (
    <Avatar size="lg" className="size-11 shrink-0">
      {v.photo_attachment_id && <AvatarImage src={attachmentUrl(v.photo_attachment_id)} alt="" loading="lazy" className="object-cover" />}
      <AvatarFallback className={v.is_archived ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}>
        <Car size={20} />
      </AvatarFallback>
    </Avatar>
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
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="flex-1 sm:flex-none">
          {saving ? <><Spinner /> Saving…</> : 'Add vehicle'}
        </Button>
      </>}
    >
      <FieldGroup className="gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Field className="gap-1.5"><FieldLabel htmlFor="av-year">Year</FieldLabel><Input id="av-year" value={form.year} onChange={set('year')} inputMode="numeric" placeholder="2021" /></Field>
          <Field className="col-span-2 gap-1.5"><FieldLabel htmlFor="av-make">Make</FieldLabel><Input id="av-make" value={form.make} onChange={set('make')} placeholder="Toyota" /></Field>
        </div>
        <Field className="gap-1.5"><FieldLabel htmlFor="av-model">Model</FieldLabel><Input id="av-model" value={form.model} onChange={set('model')} placeholder="Tacoma" /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="av-name">Nickname (optional)</FieldLabel><Input id="av-name" value={form.name} onChange={set('name')} placeholder="The truck" /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="av-plate">License plate (optional)</FieldLabel><Input id="av-plate" value={form.license_plate} onChange={set('license_plate')} /></Field>
        <Field orientation="horizontal" className="py-1">
          <Checkbox id="av-ev" checked={form.is_electric} onCheckedChange={(c) => setForm((f) => ({ ...f, is_electric: c }))} />
          <FieldLabel htmlFor="av-ev">
            Electric vehicle <FieldDescription className="text-xs">— tracks charging in kWh</FieldDescription>
          </FieldLabel>
        </Field>
      </FieldGroup>
      {error && <p className="text-xs text-destructive">{error}</p>}
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Garage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} vehicle{active.length === 1 ? '' : 's'}
            {sold.length > 0 && ` · ${sold.length} sold`}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0"><Plus /> Add vehicle</Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <Card className="py-20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-6"><Car /></EmptyMedia>
              <EmptyTitle>No vehicles yet</EmptyTitle>
              <EmptyDescription>Add a car and MileMarker starts tracking fuel, service and what it all costs.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAdding(true)}><Plus /> Add your first vehicle</Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((v) => (
              <Card key={v.id} size="sm" className="relative group transition-shadow hover:shadow-md px-4">
                {/* Stretched link: the whole card navigates, while quick actions sit above it. */}
                <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-[min(var(--radius-4xl),24px)]" />
                <div className="flex items-start gap-3">
                  <VehicleAvatar v={v} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{vehicleTitle(v)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {v.license_plate || (v.is_electric ? 'Electric' : '\u00a0')}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="flex items-end gap-4 mt-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Odometer</p>
                    <p className="text-sm font-medium num mt-0.5">{distance(v.odometer)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="text-sm font-medium num mt-0.5">{money(v.total_cost)}</p>
                  </div>
                  <span className="flex-1" />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="secondary"
                          onClick={() => navigate(`/vehicle/${v.id}?tab=fuel&add=1`)}
                          className="relative z-10 -mb-0.5"
                          aria-label={`${v.is_electric ? 'Log charge' : 'Log fuel'} for ${vehicleTitle(v)}`}
                        />
                      }
                    >
                      {v.is_electric ? <Zap /> : <Fuel />}
                      <span className="hidden lg:inline">Log</span>
                    </TooltipTrigger>
                    <TooltipContent>{v.is_electric ? 'Log charge' : 'Log fuel'}</TooltipContent>
                  </Tooltip>
                </div>
              </Card>
            ))}
          </div>

          {sold.length > 0 && (
            <div className="mt-8">
              <p className="text-sm font-medium text-muted-foreground mb-3">Sold</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sold.map((v) => (
                  <Card key={v.id} size="sm" className="relative group px-4 opacity-60 hover:opacity-100 transition-opacity">
                    <Link to={`/vehicle/${v.id}`} aria-label={vehicleTitle(v)} className="absolute inset-0 rounded-[min(var(--radius-4xl),24px)]" />
                    <div className="flex items-start gap-3">
                      <VehicleAvatar v={v} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{vehicleTitle(v)}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          Sold{v.sold_date ? ` ${new Date(v.sold_date + 'T00:00:00').toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-end gap-4 mt-4">
                      <div><p className="text-xs text-muted-foreground">Odometer</p><p className="text-sm font-medium num mt-0.5">{distance(v.odometer)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Spent</p><p className="text-sm font-medium num mt-0.5">{money(v.total_cost)}</p></div>
                    </div>
                  </Card>
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
