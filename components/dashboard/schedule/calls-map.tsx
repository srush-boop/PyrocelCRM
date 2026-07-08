'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { toast } from 'sonner'
import {
  Check,
  ChevronsUpDown,
  Loader2,
  MapPin,
  Route as RouteIcon,
  Search,
  Siren,
  Truck,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DISCIPLINES, disciplineMeta } from '@/lib/disciplines'
import {
  getEngineerRoute,
  getDispatchCandidates,
  assignCall,
} from '@/app/(dashboard)/dashboard/schedule/map/actions'
import type {
  CallsMapData,
  EngineerRoute,
  MapCall,
  DispatchCandidate,
} from '@/app/(dashboard)/dashboard/schedule/map/types'
import type { Branch, Profile, ServiceType, SystemType, Site } from '@/lib/types/database'

// Leaflet touches `window`, so the canvas must only render on the client.
const CallsMapCanvas = dynamic(
  () => import('./calls-map-canvas').then((m) => m.CallsMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-muted/40 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading map…
      </div>
    ),
  },
)

interface CallsMapProps {
  initialData: CallsMapData
  branches: Branch[]
  activeBranchId: string | null
  canSwitchBranch: boolean
  loadError: string | null
  // Data for the header "Book Call" dialog (reactive / emergency calls).
  reactiveServiceTypes?: ServiceType[]
  systemTypes?: SystemType[]
  bookingSites?: Site[]
  bookingEngineers?: Profile[]
  clients?: { id: string; name: string }[]
}

const URGENCY_LEGEND: { key: string; label: string; className: string }[] = [
  { key: 'overdue', label: 'Overdue', className: 'bg-destructive' },
  { key: 'due-soon', label: 'Due today', className: 'bg-amber-500' },
  { key: 'scheduled', label: 'Scheduled', className: 'bg-primary' },
  { key: 'unscheduled', label: 'Unscheduled', className: 'bg-muted-foreground' },
]

function formatEta(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function CallsMap({
  initialData,
  branches,
  activeBranchId,
  canSwitchBranch,
  loadError,
  reactiveServiceTypes = [],
  systemTypes = [],
  bookingSites = [],
  bookingEngineers = [],
  clients = [],
}: CallsMapProps) {
  const { calls, engineers, sites } = initialData
  const [showCalls, setShowCalls] = useState(true)
  const [showEngineers, setShowEngineers] = useState(true)
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [hideOnLeave, setHideOnLeave] = useState(true)
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>('none')
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [route, setRoute] = useState<EngineerRoute | null>(null)
  const [isPending, startTransition] = useTransition()

  // Dispatch state
  const [dispatchCall, setDispatchCall] = useState<MapCall | null>(null)
  const [candidates, setCandidates] = useState<DispatchCandidate[]>([])
  const [requiredDiscipline, setRequiredDiscipline] = useState<string | null>(null)
  const [highlightCandidateId, setHighlightCandidateId] = useState<string | null>(null)
  const [isDispatching, startDispatch] = useTransition()
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  )

  // Departments present in the engineer set, for the filter.
  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const e of engineers) if (e.departmentName) set.add(e.departmentName)
    return Array.from(set).sort()
  }, [engineers])

  // Apply discipline / department / leave filters to engineer markers.
  const filteredEngineers = useMemo(() => {
    return engineers.filter((e) => {
      if (disciplineFilter !== 'all' && (e.discipline ?? 'general') !== disciplineFilter) return false
      if (departmentFilter !== 'all' && e.departmentName !== departmentFilter) return false
      if (hideOnLeave && e.onLeave) return false
      return true
    })
  }, [engineers, disciplineFilter, departmentFilter, hideOnLeave])

  function handleEngineerChange(id: string) {
    setSelectedEngineerId(id)
    setRoute(null)
    if (id === 'none') return
    startTransition(async () => {
      const res = await getEngineerRoute(id)
      if (!res.ok || !res.route) {
        toast.error(res.error || 'Could not load route')
        return
      }
      setRoute(res.route)
      if (!res.route.hasHome) {
        toast.message('No home postcode set', {
          description:
            'This engineer has no home postcode, so the route is not anchored to a start/finish point.',
        })
      }
    })
  }

  // Enter dispatch mode for a call: fetch skill-matched, in-radius candidates.
  function startDispatchForCall(call: MapCall) {
    setDispatchCall(call)
    setCandidates([])
    setHighlightCandidateId(null)
    setSelectedEngineerId('none')
    setRoute(null)
    startDispatch(async () => {
      const res = await getDispatchCandidates({
        callLat: call.latitude,
        callLng: call.longitude,
        systemTypeName: call.systemTypeName,
        branchId: activeBranchId,
        radiusMiles: 10,
      })
      if (!res.ok) {
        toast.error(res.error || 'Could not find engineers')
        return
      }
      setCandidates(res.candidates ?? [])
      setRequiredDiscipline(res.requiredDiscipline ?? null)
      if ((res.candidates ?? []).length > 0) {
        setHighlightCandidateId(res.candidates![0].engineerId)
      } else {
        toast.message('No engineers within 10 miles', {
          description: 'Try widening the search or check who is on leave.',
        })
      }
    })
  }

  function exitDispatch() {
    setDispatchCall(null)
    setCandidates([])
    setHighlightCandidateId(null)
    setRequiredDiscipline(null)
  }

  // After a call is booked from the header, zoom the map to that site so the
  // new call is immediately visible. Also make sure the calls layer is on and
  // any active dispatch is cleared so nothing hides the fresh marker.
  function handleBooked({ siteId }: { siteId: string }) {
    exitDispatch()
    setShowCalls(true)
    if (sites.some((s) => s.id === siteId)) {
      setSelectedSiteId(siteId)
    }
  }

  function handleAssign(candidate: DispatchCandidate) {
    if (!dispatchCall) return
    setAssigningId(candidate.engineerId)
    startDispatch(async () => {
      const res = await assignCall(dispatchCall.taskId, candidate.engineerId)
      setAssigningId(null)
      if (!res.ok) {
        toast.error(res.error || 'Could not assign the call')
        return
      }
      toast.success(`Assigned to ${candidate.engineerName}`, {
        description: dispatchCall.isEmergency
          ? 'Emergency notification sent to the engineer.'
          : undefined,
      })
      exitDispatch()
    })
  }

  const overdueCount = calls.filter((c) => c.urgency === 'overdue').length
  const emergencyCalls = useMemo(() => calls.filter((c) => c.isEmergency), [calls])
  const engineersWithPosition = filteredEngineers.filter(
    (e) => e.latitude != null && e.longitude != null,
  )

  // Emergency calls always render (even if the calls layer is off) so they can't
  // be missed; other calls hide behind dispatch mode to reduce clutter.
  const visibleCalls = useMemo(() => {
    if (dispatchCall) {
      const others = emergencyCalls.filter((c) => c.taskId !== dispatchCall.taskId)
      return [dispatchCall, ...others]
    }
    if (showCalls) return calls
    return emergencyCalls
  }, [dispatchCall, showCalls, calls, emergencyCalls])

  return (
    <div className="space-y-4">
      {/* Page header (owns the Book Call dialog so booking can zoom the map) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
            <Link href="/dashboard/schedule">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Calls
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Calls Map</h1>
          <p className="text-muted-foreground text-pretty">
            Open unbooked calls and live engineer positions — find the closest free engineer, or the
            nearest work.
          </p>
        </div>
        {reactiveServiceTypes.length > 0 && (
          <CreateTaskDialog
            siteServices={[]}
            engineers={bookingEngineers}
            clients={clients}
            reactiveServiceTypes={reactiveServiceTypes}
            sites={bookingSites}
            systemTypes={systemTypes}
            defaultMode="reactive"
            onBooked={handleBooked}
          />
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Control panel */}
        <div className="w-full shrink-0 space-y-4 lg:w-80">
        {/* Emergency alert banner */}
        {emergencyCalls.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <Siren className="h-4 w-4" />
                {emergencyCalls.length} emergency call{emergencyCalls.length === 1 ? '' : 's'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {emergencyCalls.map((c) => (
                <div key={c.taskId} className="rounded-md border border-destructive/30 bg-background p-2 text-xs">
                  <p className="font-semibold">{c.siteName}</p>
                  <p className="text-muted-foreground">
                    {c.callTypeName ?? c.serviceTypeName ?? 'Emergency'}
                    {c.assignedEngineerName ? ` · ${c.assignedEngineerName}` : ' · unassigned'}
                  </p>
                  {c.respondBy && (
                    <p className="text-destructive">
                      Attend by{' '}
                      {new Date(c.respondBy).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-1 h-7 w-full gap-1 text-xs"
                    onClick={() => startDispatchForCall(c)}
                  >
                    <Truck className="h-3 w-3" />
                    Dispatch
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Dispatch panel (active when dispatching a call) */}
        {dispatchCall ? (
          <Card className="border-primary/40">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4" />
                  Dispatch
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exitDispatch}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close dispatch</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-2 text-xs">
                {dispatchCall.isEmergency && (
                  <span className="mb-1 inline-flex items-center gap-1 font-bold text-destructive">
                    <Siren className="h-3 w-3" /> EMERGENCY
                  </span>
                )}
                <p className="font-semibold">{dispatchCall.siteName}</p>
                <p className="text-muted-foreground">
                  {[dispatchCall.systemTypeName, dispatchCall.callTypeName ?? dispatchCall.serviceTypeName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {requiredDiscipline && (
                  <p className="mt-1">
                    Needs{' '}
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        background: disciplineMeta(requiredDiscipline as never).color,
                        color: disciplineMeta(requiredDiscipline as never).onColor,
                      }}
                    >
                      {disciplineMeta(requiredDiscipline as never).label}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-muted-foreground">Engineers within 10 miles, best-placed first.</p>
              </div>

              {isDispatching && candidates.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Finding engineers…
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No available engineers within 10 miles.
                </p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((c) => {
                    const meta = disciplineMeta(c.discipline)
                    const active = highlightCandidateId === c.engineerId
                    return (
                      <button
                        key={c.engineerId}
                        type="button"
                        onClick={() => setHighlightCandidateId(c.engineerId)}
                        className={cn(
                          'w-full rounded-md border p-2 text-left text-xs transition-colors',
                          active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{c.engineerName}</span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: meta.color, color: meta.onColor }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-muted-foreground">
                          <span>
                            {formatEta(c.drivingMinutes)} · {c.drivingMiles} mi
                            {c.approximate ? '*' : ''}
                          </span>
                          {c.skillMatch ? (
                            <span className="font-medium text-emerald-600">Skill match</span>
                          ) : (
                            <span>Other trade</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-muted-foreground">
                          {c.lastSeenLabel}
                          {c.bookedTodayCount > 0 ? ` · ${c.bookedTodayCount} today` : ''}
                        </p>
                        {active && (
                          <Button
                            size="sm"
                            className="mt-2 h-7 w-full gap-1 text-xs"
                            disabled={isDispatching}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAssign(c)
                            }}
                          >
                            {assigningId === c.engineerId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Assign {dispatchCall.isEmergency ? '& notify' : ''}
                          </Button>
                        )}
                      </button>
                    )
                  })}
                  <p className="text-[11px] text-muted-foreground">
                    ETAs are driving estimates. * = approximate (routing unavailable).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canSwitchBranch && branches.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <BranchFilter branches={branches} activeBranchId={activeBranchId} />
                </div>
              )}

              {/* Site search / select */}
              <div className="space-y-1.5">
                <Label>Find a site</Label>
                <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={sitePickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedSite ? selectedSite.name : 'Search sites…'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name or postcode…" />
                      <CommandList>
                        <CommandEmpty>No sites found.</CommandEmpty>
                        <CommandGroup>
                          {sites.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.name} ${s.postcode ?? ''}`}
                              onSelect={() => {
                                setSelectedSiteId(s.id === selectedSiteId ? null : s.id)
                                setSitePickerOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedSiteId === s.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span className="truncate">{s.name}</span>
                              {s.postcode && (
                                <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                  {s.postcode}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedSite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => setSelectedSiteId(null)}
                  >
                    <X className="h-3 w-3" />
                    Clear selected site
                  </Button>
                )}
              </div>

              <Separator />

              {/* Layer toggles */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-calls">Open calls</Label>
                  <p className="text-xs text-muted-foreground">{calls.length} shown</p>
                </div>
                <Switch id="show-calls" checked={showCalls} onCheckedChange={setShowCalls} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-engineers">Engineers</Label>
                  <p className="text-xs text-muted-foreground">
                    {engineersWithPosition.length} located
                  </p>
                </div>
                <Switch
                  id="show-engineers"
                  checked={showEngineers}
                  onCheckedChange={setShowEngineers}
                />
              </div>

              {/* Discipline filter */}
              <div className="space-y-1.5">
                <Label>Discipline</Label>
                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All disciplines</SelectItem>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department filter */}
              {departments.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="hide-leave" className="text-sm font-normal">
                  Hide engineers on leave
                </Label>
                <Switch id="hide-leave" checked={hideOnLeave} onCheckedChange={setHideOnLeave} />
              </div>

              <Separator />

              {/* Engineer route */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <RouteIcon className="h-4 w-4" />
                  Engineer route (today)
                </Label>
                <Select value={selectedEngineerId} onValueChange={handleEngineerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {filteredEngineers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.bookedTodayCount > 0 ? ` (${e.bookedTodayCount})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPending && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading route…
                  </p>
                )}
                {route && !isPending && (
                  <div className="rounded-md border bg-muted/40 p-2 text-xs">
                    {route.stops.length === 0 ? (
                      <p className="text-muted-foreground">
                        No booked calls today for {route.engineerName}.
                      </p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {route.stops.filter((s) => s.kind === 'call').length} stop
                          {route.stops.filter((s) => s.kind === 'call').length === 1 ? '' : 's'} ·{' '}
                          {route.totalMiles} mi
                          {route.drivingMinutes != null ? ` · ${formatEta(route.drivingMinutes)} driving` : ''}
                        </p>
                        {route.approximate && (
                          <p className="mt-1 text-muted-foreground">Approximate (straight-line) route.</p>
                        )}
                        {!route.hasHome && (
                          <p className="mt-1 text-muted-foreground">No home postcode anchor.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Legend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Calls</p>
            {URGENCY_LEGEND.map((l) => (
              <div key={l.key} className="flex items-center gap-2 text-sm">
                <span className={cn('inline-block h-3 w-3 rounded-full', l.className)} />
                <span>{l.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <Siren className="h-3.5 w-3.5 text-destructive" />
              <span>Emergency (pulsing)</span>
            </div>
            <Separator className="my-1" />
            <p className="text-xs font-medium text-muted-foreground">Engineers</p>
            {DISCIPLINES.map((d) => (
              <div key={d.key} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: d.color }}
                />
                <span>{d.label}</span>
              </div>
            ))}
            {overdueCount > 0 && (
              <Badge variant="destructive" className="mt-1">
                {overdueCount} overdue
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

        {/* Map. `isolate` creates a stacking context so Leaflet's high internal
            z-indexes (panes/controls up to ~1000) can't paint over portalled
            dialogs (e.g. Book Call), which sit at z-50 on the document root. */}
        <Card className="isolate flex-1 overflow-hidden p-0">
          <div className="h-[calc(100vh-16rem)] min-h-[460px] w-full">
            {loadError ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
                {loadError}
              </div>
            ) : (
              <CallsMapCanvas
                calls={visibleCalls}
                engineers={showEngineers ? filteredEngineers : []}
                route={route}
                focusSite={selectedSite}
                dispatchCall={dispatchCall}
                candidates={candidates}
                highlightCandidateId={highlightCandidateId}
                onDispatch={startDispatchForCall}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
