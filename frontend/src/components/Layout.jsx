import React, { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { Car, Settings as SettingsIcon, Sun, Moon, ChevronsUpDown, Check, Plus } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { getVehicles, attachmentUrl } from '../api/client.js'
import { vehicleTitle } from '../vehicles.js'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarRail, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Literal class names per size: Tailwind's scanner never sees interpolated ones.
const THUMB = {
  sm: { box: 'size-6 rounded-md', icon: 14 },
  lg: { box: 'size-8 rounded-lg', icon: 16 },
}

function Thumb({ v, size = 'sm' }) {
  const { box, icon } = THUMB[size]
  if (v.photo_attachment_id) {
    return <img src={attachmentUrl(v.photo_attachment_id)} alt="" className={`${box} shrink-0 object-cover`} />
  }
  return (
    <div className={`${box} flex shrink-0 items-center justify-center ${
      v.is_archived ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
    }`}>
      <Car size={icon} />
    </div>
  )
}

/** Picks the car you're looking at; heads the sidebar on vehicle pages. */
function VehicleSwitcher({ vehicleId, label }) {
  const [vehicles, setVehicles] = useState([])
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()

  // Refetch when the vehicle changes, so a rename or a new car shows up here.
  useEffect(() => { getVehicles(true).then(setVehicles).catch(() => setVehicles([])) }, [vehicleId, label])

  // Land on the same tab you were on: switching cars to compare the same
  // thing is the whole point.
  const tab = params.get('tab')
  const go = (to) => { setOpenMobile(false); navigate(to) }
  const href = (id) => `/vehicle/${id}${tab ? `?tab=${tab}` : ''}`

  const active = vehicles.filter((v) => !v.is_archived)
  const sold = vehicles.filter((v) => v.is_archived)
  const current = vehicles.find((v) => String(v.id) === String(vehicleId))

  const item = (v) => {
    const isCurrent = String(v.id) === String(vehicleId)
    return (
      <DropdownMenuItem key={v.id} onClick={() => go(href(v.id))} className="gap-2.5">
        <Thumb v={v} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${isCurrent ? 'font-medium' : ''}`}>{vehicleTitle(v)}</span>
          {v.odometer != null && (
            <span className="num block text-xs text-muted-foreground">{v.odometer.toLocaleString()}</span>
          )}
        </span>
        {isCurrent && <Check className="text-primary" />}
      </DropdownMenuItem>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            {current ? <Thumb v={current} size="lg" /> : <span className="size-8 shrink-0 rounded-lg bg-muted" />}
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-medium">{label}</span>
              {current?.odometer != null && (
                <span className="num truncate text-xs text-muted-foreground">{current.odometer.toLocaleString()}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] min-w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Vehicles</DropdownMenuLabel>
              {active.map(item)}
            </DropdownMenuGroup>
            {sold.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sold</DropdownMenuLabel>
                {sold.map(item)}
              </DropdownMenuGroup>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => go('/garage')}><Car /> All vehicles</DropdownMenuItem>
            <DropdownMenuItem onClick={() => go('/garage?add=1')}><Plus /> Add a vehicle</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

// A router link rendered as a sidebar row; closes the mobile sheet on tap.
function NavRow({ to, icon: Icon, children, end }) {
  const { setOpenMobile } = useSidebar()
  const match = useMatch({ path: to, end: end ?? false })
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={!!match}
        render={<NavLink to={to} onClick={() => setOpenMobile(false)} />}
      >
        <Icon /> <span>{children}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AppSidebar({ vehicleId, crumb, nav }) {
  const { resolved, toggle } = useTheme()
  const { setOpenMobile } = useSidebar()
  const hasSections = !!nav?.items?.length

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/garage" onClick={() => setOpenMobile(false)} />}>
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Car className="size-3.5!" />
              </span>
              <span className="font-heading text-base font-semibold tracking-tight">MileMarker</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {vehicleId && crumb && <VehicleSwitcher vehicleId={vehicleId} label={crumb} />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {hasSections && <SidebarGroupLabel>Vehicle</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {hasSections ? (
                nav.items.map((t) => (
                  <SidebarMenuItem key={t.key}>
                    <SidebarMenuButton
                      isActive={nav.active === t.key}
                      aria-current={nav.active === t.key ? 'page' : undefined}
                      onClick={() => { nav.onSelect(t.key); setOpenMobile(false) }}
                    >
                      <t.icon /> <span>{t.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <NavRow to="/garage" icon={Car}>Garage</NavRow>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {hasSections && <NavRow to="/garage" icon={Car}>All vehicles</NavRow>}
          <NavRow to="/settings" icon={SettingsIcon}>Settings</NavRow>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggle}>
              {resolved === 'dark' ? <Sun /> : <Moon />}
              <span>{resolved === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export default function Layout() {
  // Pages publish their breadcrumb label and their section nav through the
  // outlet context; both are cleared on unmount. Hoisting the nav up here is
  // what lets the vehicle's own tabs live in the app-wide sidebar.
  const [crumb, setCrumb] = useState(null)
  const [nav, setNav] = useState(null)
  const vehicleMatch = useMatch('/vehicle/:id')
  const vehicleId = vehicleMatch?.params?.id ?? null
  const { resolved, toggle } = useTheme()

  const outlet = React.useMemo(() => ({ setCrumb, setNav }), [setCrumb, setNav])

  return (
    <SidebarProvider className="h-[100dvh] overflow-hidden">
      <AppSidebar vehicleId={vehicleId} crumb={crumb} nav={nav} />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {vehicleId ? (
                <>
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbLink render={<Link to="/garage" />}>Garage</BreadcrumbLink>
                  </BreadcrumbItem>
                  {crumb && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0">
                        <BreadcrumbPage className="truncate">{crumb}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage>{crumb ?? 'Garage'}</BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme" />}
            >
              {resolved === 'dark' ? <Sun /> : <Moon />}
            </TooltipTrigger>
            <TooltipContent>{resolved === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Settings" nativeButton={false} render={<NavLink to="/settings" />} />
              }
            >
              <SettingsIcon />
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet context={outlet} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
