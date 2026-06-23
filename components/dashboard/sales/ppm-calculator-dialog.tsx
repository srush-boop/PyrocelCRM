'use client'

import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { formatPence } from '@/lib/sales'
import { calculatePpm, type PpmInput } from '@/lib/ppm'
import type { AssetType, PpmAssetRow, PpmVisitRow } from '@/lib/types/database'

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k_${Math.random().toString(36).slice(2)}`

// Local rows carry a stable key for list rendering.
type AssetDraft = PpmAssetRow & { key: string }
type VisitDraft = PpmVisitRow & { key: string }

// The draft mirrors QuoteSystemPpm but uses string inputs for editing.
export interface PpmDraft {
  num_visits: number
  round_trip_miles: number
  mileage_rate_pence: number
  travel_minutes_per_visit: number
  hourly_cost_pence: number
  download_required: boolean
  download_minutes_per_visit: number
  access_minutes_per_visit: number
  remote_monitored: boolean
  remote_minutes_per_visit: number
  out_of_hours: boolean
  ooh_uplift_percent: number
  margin_percent: number
  computed_cost_pence: number
  computed_price_pence: number
  assets: PpmAssetRow[]
  visits: PpmVisitRow[]
  notes: string | null
}

interface PpmCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  systemName: string
  // Asset types belonging to this system's system type.
  assetTypes: AssetType[]
  // Default PPM Engineer hourly cost (pence) from direct costs.
  defaultHourlyCostPence: number
  // Existing draft for this system, if a calculation has already been applied.
  existingDraft?: PpmDraft | null
  disabled?: boolean
  // Called with the breakdown + computed price (pence) when applied.
  onApply: (draft: PpmDraft) => void
}

function num(v: string): number {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export function PpmCalculatorDialog({
  open,
  onOpenChange,
  systemName,
  assetTypes,
  defaultHourlyCostPence,
  existingDraft,
  disabled,
  onApply,
}: PpmCalculatorDialogProps) {
  // ---- Inputs (strings for numeric fields) ----
  const [numVisits, setNumVisits] = useState('1')
  const [miles, setMiles] = useState('0')
  const [mileageRate, setMileageRate] = useState('0.45') // pounds per mile
  const [travelMins, setTravelMins] = useState('0')
  const [hourlyCost, setHourlyCost] = useState('0') // pounds
  const [downloadRequired, setDownloadRequired] = useState(false)
  const [downloadMins, setDownloadMins] = useState('0')
  const [accessMins, setAccessMins] = useState('0')
  const [remoteMonitored, setRemoteMonitored] = useState(false)
  const [remoteMins, setRemoteMins] = useState('0')
  const [outOfHours, setOutOfHours] = useState(false)
  const [oohUplift, setOohUplift] = useState('0')
  const [margin, setMargin] = useState('0')
  const [assets, setAssets] = useState<AssetDraft[]>([])
  const [visits, setVisits] = useState<VisitDraft[]>([
    { key: uid(), label: 'Visit 1', coverage_percent: 100 },
    { key: uid(), label: 'Visit 2', coverage_percent: 25 },
  ])

  // ---- Hydrate when opening ----
  useEffect(() => {
    if (!open) return
    if (existingDraft) {
      setNumVisits(String(existingDraft.num_visits))
      setMiles(String(existingDraft.round_trip_miles))
      setMileageRate((existingDraft.mileage_rate_pence / 100).toFixed(2))
      setTravelMins(String(existingDraft.travel_minutes_per_visit))
      setHourlyCost((existingDraft.hourly_cost_pence / 100).toFixed(2))
      setDownloadRequired(existingDraft.download_required)
      setDownloadMins(String(existingDraft.download_minutes_per_visit))
      setAccessMins(String(existingDraft.access_minutes_per_visit))
      setRemoteMonitored(existingDraft.remote_monitored)
      setRemoteMins(String(existingDraft.remote_minutes_per_visit))
      setOutOfHours(existingDraft.out_of_hours)
      setOohUplift(String(existingDraft.ooh_uplift_percent))
      setMargin(String(existingDraft.margin_percent))
      setAssets((existingDraft.assets ?? []).map((a) => ({ ...a, key: uid() })))
      setVisits(
        (existingDraft.visits ?? []).length > 0
          ? existingDraft.visits.map((v) => ({ ...v, key: uid() }))
          : [{ key: uid(), label: 'Visit 1', coverage_percent: 100 }],
      )
    } else {
      // Seed hourly cost from direct costs and assets from the library.
      setHourlyCost((defaultHourlyCostPence / 100).toFixed(2))
      setNumVisits('2')
      setAssets(
        assetTypes.map((a) => ({
          key: uid(),
          asset_type_id: a.id,
          name: a.name,
          minutes: a.default_minutes,
          quantity: 0,
        })),
      )
      setVisits([
        { key: uid(), label: 'Visit 1', coverage_percent: 100 },
        { key: uid(), label: 'Visit 2', coverage_percent: 25 },
      ])
    }
    // Only re-run when the dialog transitions to open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ---- Build calc input ----
  const input: PpmInput = useMemo(
    () => ({
      numVisits: num(numVisits),
      roundTripMiles: num(miles),
      mileageRatePence: Math.round(num(mileageRate) * 100),
      travelMinutesPerVisit: num(travelMins),
      hourlyCostPence: Math.round(num(hourlyCost) * 100),
      downloadRequired,
      downloadMinutesPerVisit: num(downloadMins),
      accessMinutesPerVisit: num(accessMins),
      remoteMonitored,
      remoteMinutesPerVisit: num(remoteMins),
      outOfHours,
      oohUpliftPercent: num(oohUplift),
      marginPercent: num(margin),
      assets: assets.map((a) => ({
        asset_type_id: a.asset_type_id,
        name: a.name,
        minutes: a.minutes,
        quantity: a.quantity,
      })),
      visits: visits.map((v) => ({ label: v.label, coverage_percent: v.coverage_percent })),
    }),
    [
      numVisits, miles, mileageRate, travelMins, hourlyCost, downloadRequired, downloadMins,
      accessMins, remoteMonitored, remoteMins, outOfHours, oohUplift, margin, assets, visits,
    ],
  )

  const result = useMemo(() => calculatePpm(input), [input])

  // ---- Asset / visit mutators ----
  function addAsset() {
    setAssets((p) => [...p, { key: uid(), asset_type_id: null, name: '', minutes: 0, quantity: 1 }])
  }
  function updateAsset(key: string, patch: Partial<AssetDraft>) {
    setAssets((p) => p.map((a) => (a.key === key ? { ...a, ...patch } : a)))
  }
  function removeAsset(key: string) {
    setAssets((p) => p.filter((a) => a.key !== key))
  }
  function addVisit() {
    setVisits((p) => [
      ...p,
      { key: uid(), label: `Visit ${p.length + 1}`, coverage_percent: 0 },
    ])
  }
  function updateVisit(key: string, patch: Partial<VisitDraft>) {
    setVisits((p) => p.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }
  function removeVisit(key: string) {
    setVisits((p) => p.filter((v) => v.key !== key))
  }

  function handleApply() {
    onApply({
      num_visits: input.numVisits,
      round_trip_miles: input.roundTripMiles,
      mileage_rate_pence: input.mileageRatePence,
      travel_minutes_per_visit: input.travelMinutesPerVisit,
      hourly_cost_pence: input.hourlyCostPence,
      download_required: input.downloadRequired,
      download_minutes_per_visit: input.downloadMinutesPerVisit,
      access_minutes_per_visit: input.accessMinutesPerVisit,
      remote_monitored: input.remoteMonitored,
      remote_minutes_per_visit: input.remoteMinutesPerVisit,
      out_of_hours: input.outOfHours,
      ooh_uplift_percent: input.oohUpliftPercent,
      margin_percent: input.marginPercent,
      computed_cost_pence: result.totalCostPence,
      computed_price_pence: result.pricePence,
      assets: input.assets,
      visits: input.visits,
      notes: null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            PPM calculator — {systemName}
          </DialogTitle>
          <DialogDescription>
            Estimate the annual service-contract price from assets, visits, travel and labour.
            Applying it adds a single priced line to this system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ---- Assets ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Assets</h3>
              <Button type="button" variant="outline" size="sm" onClick={addAsset}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add asset
              </Button>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assets. Add asset types for this system, or add rows manually.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground">
                  <span>Asset</span>
                  <span className="text-right">Mins each</span>
                  <span className="text-right">Quantity</span>
                  <span />
                </div>
                {assets.map((a) => (
                  <div key={a.key} className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2">
                    <Input
                      value={a.name}
                      onChange={(e) => updateAsset(a.key, { name: e.target.value })}
                      placeholder="Asset name"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={a.minutes}
                      onChange={(e) => updateAsset(a.key, { minutes: num(e.target.value) })}
                      className="text-right"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={a.quantity}
                      onChange={(e) => updateAsset(a.key, { quantity: num(e.target.value) })}
                      className="text-right"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAsset(a.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove asset</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* ---- Visits ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Visits &amp; coverage</h3>
                <p className="text-xs text-muted-foreground">
                  Share of assets tested on each visit (e.g. 100% then 25%).
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVisit}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add visit
              </Button>
            </div>
            <div className="space-y-2">
              {visits.map((v) => (
                <div key={v.key} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
                  <Input
                    value={v.label}
                    onChange={(e) => updateVisit(v.key, { label: e.target.value })}
                    placeholder="Visit label"
                  />
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={v.coverage_percent}
                      onChange={(e) =>
                        updateVisit(v.key, { coverage_percent: num(e.target.value) })
                      }
                      className="pr-7 text-right"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVisit(v.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove visit</span>
                  </Button>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Number of charged visits</span> is set
              below and may differ from the rows above.
            </div>
          </section>

          <Separator />

          {/* ---- Labour, travel, modifiers ---- */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-visits">Number of visits</Label>
              <Input
                id="ppm-visits"
                type="number"
                min={0}
                value={numVisits}
                onChange={(e) => setNumVisits(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-hourly">Engineer hourly cost (£)</Label>
              <Input
                id="ppm-hourly"
                type="number"
                min={0}
                step="0.01"
                value={hourlyCost}
                onChange={(e) => setHourlyCost(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-miles">Round-trip miles / visit</Label>
              <Input
                id="ppm-miles"
                type="number"
                min={0}
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-mileage">Mileage rate (£/mile)</Label>
              <Input
                id="ppm-mileage"
                type="number"
                min={0}
                step="0.01"
                value={mileageRate}
                onChange={(e) => setMileageRate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-travelmins">Travel time / visit (min)</Label>
              <Input
                id="ppm-travelmins"
                type="number"
                min={0}
                value={travelMins}
                onChange={(e) => setTravelMins(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ppm-access">Access difficulty / visit (min)</Label>
              <Input
                id="ppm-access"
                type="number"
                min={0}
                value={accessMins}
                onChange={(e) => setAccessMins(e.target.value)}
              />
            </div>
          </section>

          <Separator />

          {/* ---- Toggle modifiers ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="ppm-download">Download required</Label>
                <p className="text-xs text-muted-foreground">Adds time per visit for panel download.</p>
              </div>
              <div className="flex items-center gap-2">
                {downloadRequired && (
                  <Input
                    type="number"
                    min={0}
                    value={downloadMins}
                    onChange={(e) => setDownloadMins(e.target.value)}
                    className="w-20 text-right"
                    aria-label="Download minutes per visit"
                  />
                )}
                <Switch id="ppm-download" checked={downloadRequired} onCheckedChange={setDownloadRequired} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="ppm-remote">Remotely monitored</Label>
                <p className="text-xs text-muted-foreground">Optional remote-check time per visit.</p>
              </div>
              <div className="flex items-center gap-2">
                {remoteMonitored && (
                  <Input
                    type="number"
                    min={0}
                    value={remoteMins}
                    onChange={(e) => setRemoteMins(e.target.value)}
                    className="w-20 text-right"
                    aria-label="Remote minutes per visit"
                  />
                )}
                <Switch id="ppm-remote" checked={remoteMonitored} onCheckedChange={setRemoteMonitored} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="ppm-ooh">Out of hours</Label>
                <p className="text-xs text-muted-foreground">Uplift % applied to the labour rate.</p>
              </div>
              <div className="flex items-center gap-2">
                {outOfHours && (
                  <div className="relative w-24">
                    <Input
                      type="number"
                      min={0}
                      value={oohUplift}
                      onChange={(e) => setOohUplift(e.target.value)}
                      className="pr-7 text-right"
                      aria-label="Out of hours uplift percent"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                )}
                <Switch id="ppm-ooh" checked={outOfHours} onCheckedChange={setOutOfHours} />
              </div>
            </div>
          </section>

          <Separator />

          {/* ---- Margin + results ---- */}
          <section className="space-y-3">
            <div className="grid gap-1.5 sm:max-w-[12rem]">
              <Label htmlFor="ppm-margin">Margin required (%)</Label>
              <div className="relative">
                <Input
                  id="ppm-margin"
                  type="number"
                  min={0}
                  max={99}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  className="pr-7 text-right"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm">
              <Row label="Testing time" value={`${result.testingMinutes.toFixed(0)} min`} />
              <Row label="Overhead time (travel/access/etc.)" value={`${result.overheadMinutes.toFixed(0)} min`} />
              <Row
                label="Total labour"
                value={`${(result.totalLabourMinutes / 60).toFixed(2)} hrs`}
              />
              <Separator className="my-1" />
              <Row label="Labour cost" value={formatPence(result.labourCostPence)} />
              <Row label="Travel cost" value={formatPence(result.travelCostPence)} />
              <Row label="Total cost" value={formatPence(result.totalCostPence)} bold />
              <Row label="Margin" value={formatPence(result.marginPence)} />
              <Separator className="my-1" />
              <Row label="Annual price" value={formatPence(result.pricePence)} bold accent />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={disabled}>
            Apply to system
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string
  value: string
  bold?: boolean
  accent?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span
        className={`tabular-nums ${bold ? 'font-semibold' : ''} ${accent ? 'text-base text-primary' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
