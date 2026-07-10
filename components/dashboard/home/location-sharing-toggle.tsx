'use client'

import { useState, useTransition } from 'react'
import { Signal, MapPin, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { updateLocationSharing } from '@/app/(dashboard)/dashboard/nearby/actions'
import { cn } from '@/lib/utils'

interface LocationSharingToggleProps {
  initialEnabled: boolean
}

export function LocationSharingToggle({ initialEnabled }: LocationSharingToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function handleToggle(next: boolean) {
    if (next) {
      // Enabling — request GPS first, then persist.
      if (!('geolocation' in navigator)) {
        toast.error('Geolocation is not supported on this device')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          startTransition(async () => {
            const res = await updateLocationSharing({
              enabled: true,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            })
            if (!res.ok) {
              toast.error(res.error || 'Failed to enable location sharing')
              return
            }
            setEnabled(true)
            toast.success('Location sharing on — colleagues can now see distance to you')
          })
        },
        (err) => {
          toast.error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Allow it in your browser settings.'
              : 'Could not get your location. Please try again.',
          )
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    } else {
      // Disabling — clear coordinates immediately.
      startTransition(async () => {
        const res = await updateLocationSharing({ enabled: false })
        if (!res.ok) {
          toast.error(res.error || 'Failed to disable location sharing')
          return
        }
        setEnabled(false)
        toast.success('Location sharing off')
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              enabled
                ? 'bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : enabled ? (
              <Signal className="h-4 w-4" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </span>
          <div className="space-y-0.5">
            <Label
              htmlFor="location-sharing-switch"
              className="cursor-pointer text-sm font-medium"
            >
              {enabled ? 'Location sharing on' : 'Location sharing off'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? 'Your GPS location is visible to colleagues finding nearby parts and calls.'
                : 'Enable to let the office dispatch nearby calls to you.'}
            </p>
          </div>
        </div>
        <Switch
          id="location-sharing-switch"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label="Toggle location sharing"
        />
      </div>

      {/* Efficiency note — always shown so engineers understand the benefit */}
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Sharing your location helps the office assign nearby calls to you and lets colleagues
        see how far away your van stock is. Your location is only stored while sharing is on
        and you can turn it off at any time.
      </p>
    </div>
  )
}
