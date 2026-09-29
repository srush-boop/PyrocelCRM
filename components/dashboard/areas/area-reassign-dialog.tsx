'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatPence } from '@/lib/billing/invoices'
import { assignServicesToAreas } from '@/lib/actions/areas'
import type { PlannerArea, PlannerService, PlannerSite } from '@/lib/areas/planner-data'

export interface ReassignSite {
  site: PlannerSite
  fromAreaIds: (string | null)[]
  toAreaId: string
  services: PlannerService[]
}

const ALL = '__all__'

function AreaChip({ area }: { area: PlannerArea | null | undefined }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: area?.color ?? 'transparent',
          border: area ? undefined : '1px dashed currentColor',
        }}
      />
      <span className={`truncate ${area ? '' : 'text-muted-foreground'}`}>{area?.name ?? 'No area'}</span>
    </span>
  )
}

export function AreaReassignDialog({
  open,
  onOpenChange,
  candidates,
  areaById,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: ReassignSite[]
  areaById: Map<string, PlannerArea>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [targetFilter, setTargetFilter] = useState(ALL)

  useEffect(() => {
    if (open) {
      setExcluded(new Set())
      setQuery('')
      setTargetFilter(ALL)
    }
  }, [open])

  const targetOptions = useMemo(() => {
    const ids = [...new Set(candidates.map((c) => c.toAreaId))]
    return ids.map((id) => areaById.get(id)).filter((a): a is PlannerArea => Boolean(a))
  }, [candidates, areaById])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidates.filter((c) => {
      if (targetFilter !== ALL && c.toAreaId !== targetFilter) return false
      if (!q) return true
      return [c.site.name, c.site.postcode, c.site.clientName].some((v) => v?.toLowerCase().includes(q))
    })
  }, [candidates, query, targetFilter])

  const included = candidates.filter((c) => !excluded.has(c.site.id))
  const includedServices = included.reduce((n, c) => n + c.services.length, 0)
  const includedPence = included.reduce((n, c) => n + c.services.reduce((s, x) => s + x.annualPence, 0), 0)
  const allVisibleIncluded = visible.length > 0 && visible.every((c) => !excluded.has(c.site.id))

  const toggleSite = (siteId: string, include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (include) next.delete(siteId)
      else next.add(siteId)
      return next
    })

  const toggleVisible = (include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const c of visible) {
        if (include) next.delete(c.site.id)
        else next.add(c.site.id)
      }
      return next
    })

  const apply = () =>
    startTransition(async () => {
      const assignments = included.flatMap((c) =>
        c.services.map((s) => ({ serviceId: s.id, areaId: c.toAreaId })),
      )
      const res = await assignServicesToAreas(assignments)
      if (!res.ok) {
        toast.error(res.error ?? 'Could not assign services')
        return
      }
      toast.success(
        `${res.updated} service${res.updated === 1 ? '' : 's'} assigned to their areas` +
          (res.skipped ? ` · ${res.skipped} skipped (assignment changed elsewhere)` : ''),
      )
      onOpenChange(false)
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign services to their new areas</DialogTitle>
          <DialogDescription className="text-pretty">
            These sites&apos; postcodes now fall in a different area from the one their services are allocated to. Untick
            any site you want to leave as it is. Pending calls move to the new area&apos;s engineer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search site, client or postcode"
              className="pl-8"
              aria-label="Search sites"
            />
          </div>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Filter by new area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All new areas</SelectItem>
              {targetOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-sm">
            <Checkbox
              id="reassign-all"
              checked={allVisibleIncluded}
              onCheckedChange={(v) => toggleVisible(v === true)}
              disabled={visible.length === 0}
            />
            <label htmlFor="reassign-all" className="font-medium">
              {visible.length === candidates.length ? 'All sites' : `All ${visible.length} shown`}
            </label>
            <span className="ml-auto text-muted-foreground">
              {included.length} of {candidates.length} included
            </span>
          </div>

          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">No sites match.</li>
            )}
            {visible.map((c) => {
              const checked = !excluded.has(c.site.id)
              const fromIds = [...new Set(c.fromAreaIds)]
              const pence = c.services.reduce((s, x) => s + x.annualPence, 0)
              const id = `reassign-${c.site.id}`
              return (
                <li key={c.site.id} className={`flex gap-3 px-3 py-3 ${checked ? '' : 'opacity-60'}`}>
                  <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggleSite(c.site.id, v === true)} className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <label htmlFor={id} className="min-w-0 font-medium">
                        {c.site.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {[c.site.postcode, c.site.clientName].filter(Boolean).join(' · ')}
                        </span>
                      </label>
                      <span className="text-sm tabular-nums text-muted-foreground">{formatPence(pence)}/yr</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {fromIds.map((fid, i) => (
                        <span key={fid ?? 'none'} className="inline-flex items-center gap-2">
                          {i > 0 && <span className="text-muted-foreground">/</span>}
                          <AreaChip area={fid ? areaById.get(fid) : null} />
                        </span>
                      ))}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="moves to" />
                      <span className="font-medium">
                        <AreaChip area={areaById.get(c.toAreaId)} />
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.services.map((s) => s.serviceTypeName).join(', ')}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground sm:mr-auto">
            {includedServices} service{includedServices === 1 ? '' : 's'} · {formatPence(includedPence)}/yr
            {excluded.size > 0 && ` · ${excluded.size} site${excluded.size === 1 ? '' : 's'} excluded`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Not now
          </Button>
          <Button onClick={apply} disabled={pending || includedServices === 0}>
            {pending ? 'Assigning…' : `Assign ${includedServices} service${includedServices === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
