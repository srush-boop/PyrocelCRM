'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPinned, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { formatPence } from '@/lib/billing/invoices'
import { matchArea, postcodeParts } from '@/lib/areas/postcodes'
import { assignPostcodeToArea, removeAreaPostcode } from '@/lib/actions/areas'
import type { AreaPlannerData } from '@/lib/areas/planner-data'
import type { AreaMapPoint } from './area-map-canvas'
import { AreaPlannerCard, type AreaSummary } from './area-planner-card'

const AreaMapCanvas = dynamic(() => import('./area-map-canvas').then((m) => m.AreaMapCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-md bg-muted" />,
})

interface DistrictSummary {
  district: string
  siteCount: number
  areaId: string | null
  ruleId: string | null
}

export function AreaPlanner({ data }: { data: AreaPlannerData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [districtTarget, setDistrictTarget] = useState<string>('')
  const [unmappedOnly, setUnmappedOnly] = useState(false)

  const areaById = useMemo(() => new Map(data.areas.map((a) => [a.id, a])), [data.areas])
  const ruleInputs = useMemo(() => data.rules.map((r) => ({ prefix: r.prefix, areaId: r.areaId })), [data.rules])

  const siteAreaId = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const s of data.sites) m.set(s.id, matchArea(s.postcode, ruleInputs)?.areaId ?? null)
    return m
  }, [data.sites, ruleInputs])

  const summaries: AreaSummary[] = useMemo(
    () =>
      data.areas.map((area) => {
        const allocated = data.services.filter((s) => s.areaId === area.id)
        const byType = new Map<string, { name: string; count: number; pence: number }>()
        for (const s of allocated) {
          const row = byType.get(s.serviceTypeName) ?? { name: s.serviceTypeName, count: 0, pence: 0 }
          row.count += 1
          row.pence += s.annualPence
          byType.set(s.serviceTypeName, row)
        }
        const inPostcodesNotAllocated = data.services.filter(
          (s) => s.areaId !== area.id && siteAreaId.get(s.siteId) === area.id,
        )
        return {
          area,
          rules: data.rules.filter((r) => r.areaId === area.id),
          revenuePence: allocated.reduce((sum, s) => sum + s.annualPence, 0),
          serviceCount: allocated.length,
          siteCount: data.sites.filter((s) => siteAreaId.get(s.id) === area.id).length,
          byServiceType: [...byType.values()].sort((a, b) => b.pence - a.pence),
          notAllocatedCount: inPostcodesNotAllocated.length,
          notAllocatedPence: inPostcodesNotAllocated.reduce((sum, s) => sum + s.annualPence, 0),
        }
      }),
    [data, siteAreaId],
  )

  const totalAllocated = summaries.reduce((sum, s) => sum + s.revenuePence, 0)
  const unallocated = data.services.filter((s) => !s.areaId)
  const unallocatedPence = unallocated.reduce((sum, s) => sum + s.annualPence, 0)

  const districts: DistrictSummary[] = useMemo(() => {
    const map = new Map<string, { count: number; areaCounts: Map<string, number> }>()
    for (const s of data.sites) {
      const d = postcodeParts(s.postcode)?.district
      if (!d) continue
      const entry = map.get(d) ?? { count: 0, areaCounts: new Map() }
      entry.count += 1
      const a = siteAreaId.get(s.id)
      if (a) entry.areaCounts.set(a, (entry.areaCounts.get(a) ?? 0) + 1)
      map.set(d, entry)
    }
    return [...map.entries()]
      .map(([district, e]) => {
        const top = [...e.areaCounts.entries()].sort((a, b) => b[1] - a[1])[0]
        return {
          district,
          siteCount: e.count,
          areaId: top?.[0] ?? null,
          ruleId: data.rules.find((r) => r.prefix === district)?.id ?? null,
        }
      })
      .sort((a, b) => a.district.localeCompare(b.district, 'en', { numeric: true }))
  }, [data.sites, data.rules, siteAreaId])

  const visibleDistricts = unmappedOnly ? districts.filter((d) => !d.areaId) : districts
  const activeDistrict = districts.find((d) => d.district === selectedDistrict) ?? null

  const points: AreaMapPoint[] = useMemo(
    () =>
      data.sites
        .filter((s) => s.latitude != null && s.longitude != null)
        .map((s) => {
          const areaId = siteAreaId.get(s.id) ?? null
          const area = areaId ? areaById.get(areaId) : null
          const district = postcodeParts(s.postcode)?.district ?? null
          return {
            siteId: s.id,
            name: s.name,
            postcode: s.postcode,
            district,
            latitude: s.latitude as number,
            longitude: s.longitude as number,
            color: area?.color ?? null,
            areaName: area?.name ?? null,
            highlighted: selectedAreaId
              ? areaId === selectedAreaId
              : selectedDistrict
                ? district === selectedDistrict
                : false,
          }
        }),
    [data.sites, siteAreaId, areaById, selectedAreaId, selectedDistrict],
  )

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong')
        return
      }
      toast.success(success)
      router.refresh()
    })

  const addPrefix = (areaId: string, prefix: string) =>
    startTransition(async () => {
      const res = await assignPostcodeToArea(areaId, prefix)
      if (!res.ok) {
        toast.error(res.error ?? 'Could not add postcode')
        return
      }
      const name = areaById.get(areaId)?.name
      toast.success(
        res.movedFrom ? `${res.prefix} moved from ${res.movedFrom} to ${name}` : `${res.prefix} added to ${name}`,
      )
      router.refresh()
    })

  const selectDistrict = (district: string) => {
    setSelectedAreaId(null)
    setSelectedDistrict(district)
    setDistrictTarget(districts.find((d) => d.district === district)?.areaId ?? '')
  }

  if (data.areas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <MapPinned className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No areas yet</p>
          <p className="text-sm text-muted-foreground">Add an area, then give it postcodes to start planning.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Recurring revenue allocated to areas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPence(totalAllocated)}</p>
          <p className="text-xs text-muted-foreground">Per year · engineer services only (no CDO or sub-contract)</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Engineer services not in any area</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPence(unallocatedPence)}</p>
          <p className="text-xs text-muted-foreground">
            {unallocated.length} service{unallocated.length === 1 ? '' : 's'} assigned directly or left open
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="flex flex-col gap-3 lg:max-h-[760px] lg:overflow-y-auto lg:pr-1">
          {summaries.map((s) => (
            <AreaPlannerCard
              key={s.area.id}
              summary={s}
              selected={selectedAreaId === s.area.id}
              pending={pending}
              onSelect={() => {
                setSelectedDistrict(null)
                setSelectedAreaId((cur) => (cur === s.area.id ? null : s.area.id))
              }}
              onAddPrefix={(prefix) => addPrefix(s.area.id, prefix)}
              onRemoveRule={(ruleId, prefix) => run(() => removeAreaPostcode(ruleId), `${prefix} removed`)}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="h-[420px] overflow-hidden rounded-lg border lg:h-[480px]">
            <AreaMapCanvas points={points} anyHighlight={points.some((p) => p.highlighted)} onSelectDistrict={selectDistrict} />
          </div>

          <Card>
            <CardHeader className="gap-1 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Postcode districts</CardTitle>
                <div className="flex items-center gap-2">
                  <Switch id="unmapped-only" checked={unmappedOnly} onCheckedChange={setUnmappedOnly} />
                  <Label htmlFor="unmapped-only" className="text-sm font-normal">
                    Not in an area only
                  </Label>
                </div>
              </div>
              <CardDescription>
                Districts your sites sit in. Pick one here or click a site on the map to put the district into an area.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {visibleDistricts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Every district is in an area.</p>
                )}
                {visibleDistricts.map((d) => {
                  const area = d.areaId ? areaById.get(d.areaId) : null
                  const active = selectedDistrict === d.district
                  return (
                    <button
                      key={d.district}
                      type="button"
                      onClick={() => selectDistrict(d.district)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
                        active ? 'border-foreground bg-accent' : 'hover:bg-accent'
                      } ${area ? '' : 'border-dashed'}`}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: area?.color ?? 'transparent', border: area ? undefined : '1px dashed currentColor' }}
                      />
                      <span className="font-medium">{d.district}</span>
                      <span className="text-xs text-muted-foreground">{d.siteCount}</span>
                    </button>
                  )
                })}
              </div>

              {activeDistrict && (
                <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-end">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Label htmlFor="district-area">
                      Area for {activeDistrict.district}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({activeDistrict.siteCount} site{activeDistrict.siteCount === 1 ? '' : 's'})
                      </span>
                    </Label>
                    <Select value={districtTarget} onValueChange={setDistrictTarget}>
                      <SelectTrigger id="district-area" className="w-full">
                        <SelectValue placeholder="Choose an area" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.areas.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={pending || !districtTarget}
                      onClick={() => addPrefix(districtTarget, activeDistrict.district)}
                    >
                      Assign
                    </Button>
                    {activeDistrict.ruleId && (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => removeAreaPostcode(activeDistrict.ruleId!), `${activeDistrict.district} removed`)
                        }
                      >
                        Remove
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSelectedDistrict(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
