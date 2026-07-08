'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
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
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getEngineerRoute,
  type CallsMapData,
  type EngineerRoute,
} from '@/app/(dashboard)/dashboard/schedule/map/actions'
import type { Branch } from '@/lib/types/database'

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
}

const URGENCY_LEGEND: { key: string; label: string; className: string }[] = [
  { key: 'overdue', label: 'Overdue', className: 'bg-destructive' },
  { key: 'due-soon', label: 'Due today', className: 'bg-amber-500' },
  { key: 'scheduled', label: 'Scheduled', className: 'bg-primary' },
  { key: 'unscheduled', label: 'Unscheduled', className: 'bg-muted-foreground' },
]

export function CallsMap({
  initialData,
  branches,
  activeBranchId,
  canSwitchBranch,
  loadError,
}: CallsMapProps) {
  const { calls, engineers, sites } = initialData
  const [showCalls, setShowCalls] = useState(true)
  const [showEngineers, setShowEngineers] = useState(true)
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>('none')
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [route, setRoute] = useState<EngineerRoute | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  )

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

  const overdueCount = calls.filter((c) => c.urgency === 'overdue').length
  const engineersWithPosition = engineers.filter((e) => e.latitude != null && e.longitude != null)

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Control panel */}
      <div className="w-full shrink-0 space-y-4 lg:w-80">
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
                <Label htmlFor="show-calls">Open unbooked calls</Label>
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
                  {engineers.map((e) => (
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
                      </p>
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

        {/* Legend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Legend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {URGENCY_LEGEND.map((l) => (
              <div key={l.key} className="flex items-center gap-2 text-sm">
                <span className={cn('inline-block h-3 w-3 rounded-full', l.className)} />
                <span>{l.label}</span>
              </div>
            ))}
            <Separator className="my-1" />
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <span>Engineer position</span>
            </div>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="mt-1">
                {overdueCount} overdue
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <Card className="flex-1 overflow-hidden p-0">
        <div className="h-[calc(100vh-16rem)] min-h-[460px] w-full">
          {loadError ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
              {loadError}
            </div>
          ) : (
            <CallsMapCanvas
              calls={showCalls ? calls : []}
              engineers={showEngineers ? engineers : []}
              route={route}
              focusSite={selectedSite}
            />
          )}
        </div>
      </Card>
    </div>
  )
}
