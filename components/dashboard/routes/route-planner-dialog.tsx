'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowUp, ArrowDown, Loader2, MapPin, Building2 } from 'lucide-react'

export interface PlannerSite {
  id: string
  name: string
  route_id: string | null
  route_position: number | null
}

interface RoutePlannerDialogProps {
  routeId: string
  routeName: string
  sites: PlannerSite[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoutePlannerDialog({
  routeId,
  routeName,
  sites,
  open,
  onOpenChange,
}: RoutePlannerDialogProps) {
  const [order, setOrder] = useState<PlannerSite[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    const routeSites = sites
      .filter((s) => s.route_id === routeId)
      .sort((a, b) => {
        const pa = a.route_position ?? Number.MAX_SAFE_INTEGER
        const pb = b.route_position ?? Number.MAX_SAFE_INTEGER
        if (pa !== pb) return pa - pb
        return a.name.localeCompare(b.name)
      })
    setOrder(routeSites)
  }, [open, sites, routeId])

  const move = (index: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    // Persist 1-based position for each site in the chosen order
    for (let i = 0; i < order.length; i++) {
      await supabase
        .from('sites')
        .update({ route_position: i + 1, updated_at: new Date().toISOString() })
        .eq('id', order[i].id)
    }
    setSaving(false)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Plan visit order
          </DialogTitle>
          <DialogDescription>
            Set the order engineers should visit sites on the {routeName} route. This order is used in
            the schedule&apos;s &quot;By route&quot; view.
          </DialogDescription>
        </DialogHeader>

        {order.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
            <p>No sites are assigned to this route yet.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {order.map((site, index) => (
              <li
                key={site.id}
                className="flex items-center gap-3 rounded-md border bg-card p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{site.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${site.name} up`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${site.name} down`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || order.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
