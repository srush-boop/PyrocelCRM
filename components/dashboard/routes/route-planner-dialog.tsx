'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

export interface PlannerService {
  id: string
  name: string
  route_id: string | null
}

export interface PlannerSite {
  id: string
  name: string
  route_id: string | null
  route_position: number | null
  services: PlannerService[]
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
  // Ordered list of sites that have at least one service on this route.
  const [order, setOrder] = useState<PlannerSite[]>([])
  // Per-site set of service ids selected to be on this route.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [saving, setSaving] = useState(false)
  const [addValue, setAddValue] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    const initialSelected: Record<string, Set<string>> = {}
    for (const site of sites) {
      const onRoute = site.services.filter((svc) => svc.route_id === routeId).map((s) => s.id)
      if (onRoute.length > 0) initialSelected[site.id] = new Set(onRoute)
    }
    const routeSites = sites
      .filter((s) => initialSelected[s.id]?.size)
      .sort((a, b) => {
        const pa = a.route_position ?? Number.MAX_SAFE_INTEGER
        const pb = b.route_position ?? Number.MAX_SAFE_INTEGER
        if (pa !== pb) return pa - pb
        return a.name.localeCompare(b.name)
      })
    setSelected(initialSelected)
    setOrder(routeSites)
    setAddValue('')
  }, [open, sites, routeId])

  // Sites not currently in the working order are available to add.
  const availableSites = useMemo(() => {
    const inOrder = new Set(order.map((s) => s.id))
    return sites
      .filter((s) => !inOrder.has(s.id) && s.services.length > 0)
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

  // Adding a site defaults to selecting all of its services on this route.
  const addSite = (siteId: string) => {
    const site = sites.find((s) => s.id === siteId)
    if (!site) return
    setSelected((prev) => ({ ...prev, [siteId]: new Set(site.services.map((s) => s.id)) }))
    setOrder((prev) => [...prev, site])
    setAddValue('')
  }

  const removeSite = (siteId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      delete next[siteId]
      return next
    })
    setOrder((prev) => prev.filter((s) => s.id !== siteId))
  }

  const toggleService = (siteId: string, serviceId: string) => {
    setSelected((prev) => {
      const current = new Set(prev[siteId] ?? [])
      if (current.has(serviceId)) current.delete(serviceId)
      else current.add(serviceId)
      return { ...prev, [siteId]: current }
    })
  }

  const toggleAll = (site: PlannerSite, checked: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [site.id]: checked ? new Set(site.services.map((s) => s.id)) : new Set(),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const updatedAt = new Date().toISOString()
    const orderIds = new Set(order.map((s) => s.id))

    // 1) Per-service route assignment for every known site/service.
    for (const site of sites) {
      const sel = selected[site.id] ?? new Set<string>()
      for (const svc of site.services) {
        const shouldBeOnRoute = sel.has(svc.id)
        if (shouldBeOnRoute && svc.route_id !== routeId) {
          await supabase
            .from('site_services')
            .update({ route_id: routeId })
            .eq('id', svc.id)
        } else if (!shouldBeOnRoute && svc.route_id === routeId) {
          await supabase
            .from('site_services')
            .update({ route_id: null })
            .eq('id', svc.id)
        }
      }
    }

    // 2) Site-level membership + visit order (keeps ordering and the schedule's
    // secondary sort working). Sites with >=1 selected service belong here.
    for (let i = 0; i < order.length; i++) {
      await supabase
        .from('sites')
        .update({ route_id: routeId, route_position: i + 1, updated_at: updatedAt })
        .eq('id', order[i].id)
    }

    // 3) Sites previously on this route but with no selected services now.
    const clearedSites = sites.filter((s) => s.route_id === routeId && !orderIds.has(s.id))
    for (const site of clearedSites) {
      await supabase
        .from('sites')
        .update({ route_id: null, route_position: null, updated_at: updatedAt })
        .eq('id', site.id)
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
            Manage route services
          </DialogTitle>
          <DialogDescription>
            {`Add sites to the ${routeName} route, choose which of their services are done on this route, and set the visit order. Only the selected services appear in the schedule's "By route" view.`}
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
                    No more sites to add
                  </div>
                ) : (
                  availableSites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      <span className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5" />
                        {site.name}
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
            <p>No sites are on this route yet. Add one above to get started.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {order.map((site, index) => {
              const sel = selected[site.id] ?? new Set<string>()
              const allSelected = site.services.length > 0 && sel.size === site.services.length
              return (
                <li key={site.id} className="rounded-md border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{site.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sel.size} of {site.services.length} service
                        {site.services.length === 1 ? '' : 's'} on this route
                      </p>
                    </div>
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
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3 pl-10">
                    {site.services.length === 0 ? (
                      <p className="text-xs text-muted-foreground">This site has no services.</p>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(c) => toggleAll(site, c === true)}
                            aria-label={`Select all services for ${site.name}`}
                          />
                          Select all
                        </label>
                        {site.services.map((svc) => {
                          const onOtherRoute = svc.route_id && svc.route_id !== routeId && !sel.has(svc.id)
                          return (
                            <label
                              key={svc.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={sel.has(svc.id)}
                                onCheckedChange={() => toggleService(site.id, svc.id)}
                                aria-label={svc.name}
                              />
                              <span>{svc.name}</span>
                              {onOtherRoute && (
                                <span className="text-xs text-muted-foreground">
                                  (on another route)
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
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
