'use client'

import { useState, useEffect, useMemo } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUp, ArrowDown, Loader2, MapPin, Building2, Plus, X } from 'lucide-react'

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
  const [addValue, setAddValue] = useState('')
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
    setAddValue('')
  }, [open, sites, routeId])

  // Sites not currently in the working order are available to add. A site may
  // belong to another route — adding it here will move it to this route.
  const availableSites = useMemo(() => {
    const inOrder = new Set(order.map((s) => s.id))
    return sites
      .filter((s) => !inOrder.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [sites, order])

  const move = (index: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const addSite = (siteId: string) => {
    const site = sites.find((s) => s.id === siteId)
    if (!site) return
    setOrder((prev) => [...prev, site])
    setAddValue('')
  }

  const removeSite = (siteId: string) => {
    setOrder((prev) => prev.filter((s) => s.id !== siteId))
  }

  const handleSave = async () => {
    setSaving(true)

    // Sites originally on this route that are no longer in the order are
    // unassigned from the route.
    const originalIds = sites.filter((s) => s.route_id === routeId).map((s) => s.id)
    const currentIds = new Set(order.map((s) => s.id))
    const removedIds = originalIds.filter((id) => !currentIds.has(id))

    const updatedAt = new Date().toISOString()

    // Assign + position every site in the chosen order (1-based).
    for (let i = 0; i < order.length; i++) {
      await supabase
        .from('sites')
        .update({ route_id: routeId, route_position: i + 1, updated_at: updatedAt })
        .eq('id', order[i].id)
    }

    // Clear assignment for removed sites.
    for (const id of removedIds) {
      await supabase
        .from('sites')
        .update({ route_id: null, route_position: null, updated_at: updatedAt })
        .eq('id', id)
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
            Manage route sites
          </DialogTitle>
          <DialogDescription>
            {`Add sites to the ${routeName} route and set the order engineers should visit them. This order is used in the schedule's "By route" view.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select value={addValue} onValueChange={addSite}>
              <SelectTrigger aria-label="Add a site to this route">
                <SelectValue placeholder="Add a site to this route…" />
              </SelectTrigger>
              <SelectContent>
                {availableSites.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    All sites are on this route
                  </div>
                ) : (
                  availableSites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      <span className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5" />
                        {site.name}
                        {site.route_id && site.route_id !== routeId && (
                          <span className="text-xs text-muted-foreground">(on another route)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {order.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
            <p>No sites are assigned to this route yet. Add one above to get started.</p>
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
                    className="h-9 w-9"
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
                    className="h-9 w-9"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${site.name} down`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => removeSite(site.id)}
                    aria-label={`Remove ${site.name} from route`}
                  >
                    <X className="h-4 w-4" />
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
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
