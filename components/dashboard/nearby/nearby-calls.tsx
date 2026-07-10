'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Navigation,
  MapPin,
  Loader2,
  Clock,
  User,
  ArrowLeftRight,
  CheckCircle2,
  Building2,
  Utensils,
} from 'lucide-react'
import { PartLocator } from '@/components/dashboard/stock/part-locator'
import { findNearbyCalls, requestTransfer, cancelTransfer, type NearbyCall } from '@/app/(dashboard)/dashboard/nearby/actions'
import type { ServiceType } from '@/lib/types/database'

const RADIUS_OPTIONS = [5, 10, 15, 25, 50]

export function NearbyCalls({ serviceTypes }: { serviceTypes: ServiceType[] }) {
  const [locating, setLocating] = useState(false)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [radius, setRadius] = useState('15')
  const [serviceTypeId, setServiceTypeId] = useState<string>('all')
  const [calls, setCalls] = useState<NearbyCall[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [transferTarget, setTransferTarget] = useState<NearbyCall | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  function runSearch(position: { latitude: number; longitude: number }) {
    setSearching(true)
    startTransition(async () => {
      const res = await findNearbyCalls({
        latitude: position.latitude,
        longitude: position.longitude,
        radiusMiles: Number(radius),
        serviceTypeId: serviceTypeId === 'all' ? null : serviceTypeId,
      })
      setSearching(false)
      if (!res.ok) {
        toast.error(res.error || 'Failed to find nearby calls')
        return
      }
      setCalls(res.calls || [])
    })
  }

  function activateLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation is not supported on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setCoords(next)
        runSearch(next)
      },
      (err) => {
        setLocating(false)
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it to find nearby calls.'
            : 'Could not get your location. Please try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  function submitTransfer() {
    if (!transferTarget) return
    const target = transferTarget
    startTransition(async () => {
      const res = await requestTransfer({ taskId: target.taskId, message: message.trim() || undefined })
      if (!res.ok) {
        toast.error(res.error || 'Failed to request transfer')
        return
      }
      toast.success('Transfer requested')
      setTransferTarget(null)
      setMessage('')
      // Mark the call locally as pending.
      setCalls((prev) =>
        prev
          ? prev.map((c) => (c.taskId === target.taskId ? { ...c, pendingRequestId: 'pending' } : c))
          : prev
      )
    })
  }

  function handleCancel(call: NearbyCall) {
    if (!call.pendingRequestId) return
    startTransition(async () => {
      const res = await cancelTransfer({ requestId: call.pendingRequestId! })
      if (!res.ok) {
        toast.error(res.error || 'Failed to cancel')
        return
      }
      toast.success('Request cancelled')
      setCalls((prev) =>
        prev ? prev.map((c) => (c.taskId === call.taskId ? { ...c, pendingRequestId: null } : c)) : prev
      )
    })
  }

  // Open Google Maps to explore places around the engineer. Uses their captured
  // location when available (so results centre on them), otherwise lets Maps use
  // the device location via a plain query.
  function openMapsSearch(query: string) {
    const url = coords
      ? `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${coords.latitude},${coords.longitude},14z`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Navigation className="h-5 w-5" />
            Find calls near me
          </CardTitle>
          <CardDescription>
            Activate your location, then filter by distance and service type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Radius</Label>
              <Select value={radius} onValueChange={setRadius}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} miles
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service type</Label>
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="All service types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All service types</SelectItem>
                  {serviceTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={activateLocation} disabled={locating || searching || isPending} className="gap-2">
              {locating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Getting location…
                </>
              ) : (
                <>
                  <Navigation className="h-4 w-4" />
                  {coords ? 'Update location' : 'Activate location'}
                </>
              )}
            </Button>
            {coords && (
              <Button
                variant="outline"
                onClick={() => runSearch(coords)}
                disabled={searching || isPending}
                className="gap-2"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Search again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Find stock nearby — an exact replica of the Stock view's "Find a Part"
          search, so engineers can locate a part across all stock locations. */}
      <PartLocator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Utensils className="h-5 w-5 text-muted-foreground" />
            Find food nearby
          </CardTitle>
          <CardDescription>
            Out on the road? Open maps to find somewhere to grab a bite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full gap-2 sm:w-auto"
            onClick={() => openMapsSearch('places to eat')}
          >
            <Utensils className="h-4 w-4" />
            Find food nearby
          </Button>
        </CardContent>
      </Card>

      {searching && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Searching for nearby calls…
        </div>
      )}

      {!searching && calls && calls.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No incomplete calls found within {radius} miles.
          </CardContent>
        </Card>
      )}

      {!searching && calls && calls.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {calls.length} call{calls.length === 1 ? '' : 's'} within {radius} miles
          </p>
          {calls.map((call) => (
            <Card key={call.taskId}>
              <CardContent className="space-y-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{call.siteName}</span>
                    {call.systemTypeName && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {call.systemTypeName}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {call.distanceMiles} mi
                    </Badge>
                  </div>
                  {call.clientName && (
                    <p className="text-sm text-muted-foreground">{call.clientName}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {call.postcode && <span>{call.postcode}</span>}
                    {call.serviceTypeName && (
                      <Badge variant="outline">{call.serviceTypeName}</Badge>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {call.status === 'in_progress' ? 'In progress' : 'Pending'}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {call.assignedEngineerName
                        ? `Assigned: ${call.assignedEngineerName}`
                        : 'Unassigned'}
                    </span>
                  </div>
                </div>
                {call.pendingRequestId ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full gap-2"
                    onClick={() => handleCancel(call)}
                    disabled={isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Transfer requested — tap to cancel
                  </Button>
                ) : (
                  <Button
                    className="h-11 w-full gap-2"
                    onClick={() => {
                      setTransferTarget(call)
                      setMessage('')
                    }}
                    disabled={isPending}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    Request transfer
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!transferTarget} onOpenChange={(open) => !open && setTransferTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request call transfer</DialogTitle>
            <DialogDescription>
              {transferTarget?.assignedEngineerName
                ? `This call is assigned to ${transferTarget.assignedEngineerName}. Your request will be sent to them and the office — either can approve.`
                : 'This call is unassigned. Your request will be sent to the office to action.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-message">Message (optional)</Label>
            <Textarea
              id="transfer-message"
              placeholder="e.g. I'm 2 miles away and free this afternoon."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
