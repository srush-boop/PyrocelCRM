'use client'

/**
 * Routine-maintenance pricing calculator — a faithful UI over the Excel port in
 * `lib/maintenance-calculator.ts`. Engineers enter per-system asset counts and
 * options; the dialog live-prices every service and, on apply, injects the
 * resulting priced service lines into the quote as a "Routine Maintenance"
 * system.
 */

import { useMemo, useState } from 'react'
import { Calculator, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calcOverview,
  clampDirectDiscount,
  resolveMaintenanceRates,
  FIRE_ASSET_LABELS,
  FIRE_MAJOR_MINUTES,
  INTRUDER_ASSET_LABELS,
  INTRUDER_HOURS,
  CCTV_ASSET_LABELS,
  CCTV_HOURS,
  ACCESS_ASSET_LABELS,
  ACCESS_HOURS,
  type MaintenanceRates,
  type MaintenanceLine,
  type FireCover,
  type FireVisits,
} from '@/lib/maintenance-calculator'

type CountMap = Record<string, number>

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export interface MaintenanceCalcResult {
  lines: MaintenanceLine[]
  totalSale: number
}

interface MaintenanceCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Saved rate overrides from company settings (null = built-in defaults). */
  savedRates?: Partial<MaintenanceRates> | null
  disabled?: boolean
  onApply: (result: MaintenanceCalcResult) => void
}

/** A labelled numeric input that stores counts as numbers in a CountMap. */
function CountRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <span className="text-sm">{label}</span>
        {hint ? <span className="ml-1 text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        className="h-8 w-20 text-right tabular-nums"
        value={value ? String(value) : ''}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
        disabled={disabled}
      />
    </div>
  )
}

function AssetGrid({
  labels,
  counts,
  setCounts,
  disabled,
}: {
  labels: Record<string, string>
  counts: CountMap
  setCounts: (next: CountMap) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(labels).map(([key, label]) => (
        <CountRow
          key={key}
          label={label}
          value={counts[key] ?? 0}
          onChange={(n) => setCounts({ ...counts, [key]: n })}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

const emptyCounts = (): CountMap => ({})

export function MaintenanceCalculatorDialog({
  open,
  onOpenChange,
  savedRates,
  disabled,
  onApply,
}: MaintenanceCalculatorDialogProps) {
  const rates = useMemo(() => resolveMaintenanceRates(savedRates), [savedRates])

  // ----- Fire & emergency lighting -----
  const [fireAssets, setFireAssets] = useState<CountMap>(emptyCounts)
  const [fireCover, setFireCover] = useState<FireCover>('standard')
  const [fireVisits, setFireVisits] = useState<FireVisits>(2)
  const [weeklyFireTesting, setWeeklyFireTesting] = useState(false)
  const [centralBatteryUnits, setCentralBatteryUnits] = useState(0)
  const [luminaires, setLuminaires] = useState(0)
  const [monthlyElTesting, setMonthlyElTesting] = useState(false)

  // ----- Intruder -----
  const [intruderAssets, setIntruderAssets] = useState<CountMap>(emptyCounts)
  const [intruderVisits, setIntruderVisits] = useState(2)
  const [intruderPlatinum, setIntruderPlatinum] = useState(false)
  const [intruderOoh, setIntruderOoh] = useState(false)

  // ----- CCTV -----
  const [cctvAssets, setCctvAssets] = useState<CountMap>(emptyCounts)
  const [cctvVisits, setCctvVisits] = useState(1)
  const [cctvOoh, setCctvOoh] = useState(false)
  const [cctvBanksmanHours, setCctvBanksmanHours] = useState(0)
  const [cctvAccessOption, setCctvAccessOption] = useState('0')
  const [cctvAccessManualCost, setCctvAccessManualCost] = useState(0)

  // ----- Access control -----
  const [accessAssets, setAccessAssets] = useState<CountMap>(emptyCounts)
  const [accessVisits, setAccessVisits] = useState(1)
  const [accessOoh, setAccessOoh] = useState(false)

  // ----- Dampers -----
  const [mechanicalDampers, setMechanicalDampers] = useState(0)
  const [automaticDampers, setAutomaticDampers] = useState(0)
  const [damperVisits, setDamperVisits] = useState(1)
  const [damperOoh, setDamperOoh] = useState(false)
  const [damperAccessCost, setDamperAccessCost] = useState(0)

  // ----- Monitoring -----
  const [fireMonitoring, setFireMonitoring] = useState<CountMap>(emptyCounts)
  const [intruderMonitoring, setIntruderMonitoring] = useState<CountMap>(emptyCounts)
  const [cctvMonitoringCost, setCctvMonitoringCost] = useState(0)

  // ----- Overview discounts -----
  const [directDiscount, setDirectDiscount] = useState(0) // percent 0..maxDiscount*100
  const [monitoringDiscount, setMonitoringDiscount] = useState(0) // percent 0..100

  // Resolve the selected CCTV access-equipment cost from the option list.
  const cctvAccessCost = useMemo(() => {
    const idx = Number.parseInt(cctvAccessOption, 10)
    const opt = rates.accessEquipmentOptions[idx]
    if (!opt) return 0
    return opt.cost === null ? cctvAccessManualCost : opt.cost
  }, [cctvAccessOption, cctvAccessManualCost, rates.accessEquipmentOptions])

  const overview = useMemo(() => {
    return calcOverview(
      {
        fire: {
          assets: fireAssets as Partial<Record<keyof typeof FIRE_MAJOR_MINUTES, number>>,
          cover: fireCover,
          visits: fireVisits,
          weeklyFireTestingVisits: weeklyFireTesting ? 52 : 0,
          centralBatteryUnits,
          luminaires,
          monthlyElTestingVisits: monthlyElTesting ? 11 : 0,
        },
        intruder: {
          assets: intruderAssets as Partial<Record<keyof typeof INTRUDER_HOURS, number>>,
          visits: intruderVisits,
          platinum: intruderPlatinum,
          outOfHours: intruderOoh,
        },
        cctv: {
          assets: cctvAssets as Partial<Record<keyof typeof CCTV_HOURS, number>>,
          visits: cctvVisits,
          outOfHours: cctvOoh,
          accessEquipmentCost: cctvAccessCost,
          banksmanHours: cctvBanksmanHours,
        },
        access: {
          assets: accessAssets as Partial<Record<keyof typeof ACCESS_HOURS, number>>,
          visits: accessVisits,
          outOfHours: accessOoh,
        },
        dampers: {
          mechanicalDampers,
          automaticDampers,
          visits: damperVisits,
          outOfHours: damperOoh,
          accessEquipmentCost: damperAccessCost,
        },
        monitoring: {
          fire: fireMonitoring,
          intruder: intruderMonitoring,
          cctvCost: cctvMonitoringCost,
          cctvMargin: 0.5,
        },
        directDiscount: directDiscount / 100,
        monitoringDiscount: monitoringDiscount / 100,
      },
      rates,
    )
  }, [
    fireAssets, fireCover, fireVisits, weeklyFireTesting, centralBatteryUnits, luminaires,
    monthlyElTesting, intruderAssets, intruderVisits, intruderPlatinum, intruderOoh,
    cctvAssets, cctvVisits, cctvOoh, cctvAccessCost, cctvBanksmanHours, accessAssets,
    accessVisits, accessOoh, mechanicalDampers, automaticDampers, damperVisits, damperOoh,
    damperAccessCost, fireMonitoring, intruderMonitoring, cctvMonitoringCost,
    directDiscount, monitoringDiscount, rates,
  ])

  const maxDiscountPct = Math.round(rates.maxDiscount * 100)
  const hasLines = overview.lines.length > 0

  function handleApply() {
    if (!hasLines) return
    onApply({ lines: overview.lines, totalSale: overview.totalSale })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Maintenance calculator
          </DialogTitle>
          <DialogDescription>
            Enter the assets on site for each discipline. Prices update live and are
            added to the quote as priced maintenance lines.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
        <Tabs defaultValue="fire" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b px-4 pt-3">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="inline-flex w-max">
                <TabsTrigger value="fire">Fire &amp; Lights</TabsTrigger>
                <TabsTrigger value="intruder">Intruder</TabsTrigger>
                <TabsTrigger value="cctv">CCTV</TabsTrigger>
                <TabsTrigger value="access">Access</TabsTrigger>
                <TabsTrigger value="dampers">Dampers</TabsTrigger>
                <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>
            </ScrollArea>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              {/* FIRE & LIGHTS */}
              <TabsContent value="fire" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Cover level</Label>
                    <Select value={fireCover} onValueChange={(v) => setFireCover(v as FireCover)} disabled={disabled}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="comprehensive">Comprehensive (+{Math.round(rates.compUplift * 100)}%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Service visits / year</Label>
                    <Select value={String(fireVisits)} onValueChange={(v) => setFireVisits(Number(v) as FireVisits)} disabled={disabled}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 visits</SelectItem>
                        <SelectItem value="4">4 visits</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="mb-1 text-sm font-medium">Fire alarm assets</p>
                  <AssetGrid labels={FIRE_ASSET_LABELS} counts={fireAssets} setCounts={setFireAssets} disabled={disabled} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="weekly-fire" className="cursor-pointer text-sm">Weekly fire testing (52 visits)</Label>
                  <Switch id="weekly-fire" checked={weeklyFireTesting} onCheckedChange={setWeeklyFireTesting} disabled={disabled} />
                </div>
                <Separator />
                <div>
                  <p className="mb-1 text-sm font-medium">Emergency lighting</p>
                  <CountRow label="Central battery units" value={centralBatteryUnits} onChange={setCentralBatteryUnits} disabled={disabled} />
                  <CountRow label="Luminaires / self-contained fittings" value={luminaires} onChange={setLuminaires} disabled={disabled} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="monthly-el" className="cursor-pointer text-sm">Monthly EL testing (11 visits)</Label>
                  <Switch id="monthly-el" checked={monthlyElTesting} onCheckedChange={setMonthlyElTesting} disabled={disabled} />
                </div>
              </TabsContent>

              {/* INTRUDER */}
              <TabsContent value="intruder" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Visits / year</Label>
                    <Input type="number" min={1} className="h-9" value={intruderVisits || ''} onChange={(e) => setIntruderVisits(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} disabled={disabled} />
                  </div>
                  <div className="flex items-end justify-between rounded-lg border p-3">
                    <Label htmlFor="intruder-plat" className="cursor-pointer text-sm">Platinum (+50%)</Label>
                    <Switch id="intruder-plat" checked={intruderPlatinum} onCheckedChange={setIntruderPlatinum} disabled={disabled} />
                  </div>
                  <div className="flex items-end justify-between rounded-lg border p-3">
                    <Label htmlFor="intruder-ooh" className="cursor-pointer text-sm">Out of hours (+50%)</Label>
                    <Switch id="intruder-ooh" checked={intruderOoh} onCheckedChange={setIntruderOoh} disabled={disabled} />
                  </div>
                </div>
                <Separator />
                <AssetGrid labels={INTRUDER_ASSET_LABELS} counts={intruderAssets} setCounts={setIntruderAssets} disabled={disabled} />
              </TabsContent>

              {/* CCTV */}
              <TabsContent value="cctv" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Visits / year</Label>
                    <Input type="number" min={1} className="h-9" value={cctvVisits || ''} onChange={(e) => setCctvVisits(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} disabled={disabled} />
                  </div>
                  <div className="flex items-end justify-between rounded-lg border p-3">
                    <Label htmlFor="cctv-ooh" className="cursor-pointer text-sm">Out of hours (+50%)</Label>
                    <Switch id="cctv-ooh" checked={cctvOoh} onCheckedChange={setCctvOoh} disabled={disabled} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Banksman hours</Label>
                    <Input type="number" min={0} step="0.5" className="h-9" value={cctvBanksmanHours || ''} onChange={(e) => setCctvBanksmanHours(Math.max(0, Number.parseFloat(e.target.value) || 0))} disabled={disabled} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Access equipment</Label>
                    <Select value={cctvAccessOption} onValueChange={setCctvAccessOption} disabled={disabled}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {rates.accessEquipmentOptions.map((opt, i) => (
                          <SelectItem key={opt.label} value={String(i)}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {rates.accessEquipmentOptions[Number.parseInt(cctvAccessOption, 10)]?.cost === null && (
                    <div className="grid gap-1.5">
                      <Label>Access equipment cost (£)</Label>
                      <Input type="number" min={0} className="h-9" value={cctvAccessManualCost || ''} onChange={(e) => setCctvAccessManualCost(Math.max(0, Number.parseFloat(e.target.value) || 0))} disabled={disabled} />
                    </div>
                  )}
                </div>
                <Separator />
                <AssetGrid labels={CCTV_ASSET_LABELS} counts={cctvAssets} setCounts={setCctvAssets} disabled={disabled} />
              </TabsContent>

              {/* ACCESS */}
              <TabsContent value="access" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Visits / year</Label>
                    <Input type="number" min={1} className="h-9" value={accessVisits || ''} onChange={(e) => setAccessVisits(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} disabled={disabled} />
                  </div>
                  <div className="flex items-end justify-between rounded-lg border p-3">
                    <Label htmlFor="access-ooh" className="cursor-pointer text-sm">Out of hours (+50%)</Label>
                    <Switch id="access-ooh" checked={accessOoh} onCheckedChange={setAccessOoh} disabled={disabled} />
                  </div>
                </div>
                <Separator />
                <AssetGrid labels={ACCESS_ASSET_LABELS} counts={accessAssets} setCounts={setAccessAssets} disabled={disabled} />
              </TabsContent>

              {/* DAMPERS */}
              <TabsContent value="dampers" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Visits / year</Label>
                    <Input type="number" min={1} className="h-9" value={damperVisits || ''} onChange={(e) => setDamperVisits(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} disabled={disabled} />
                  </div>
                  <div className="flex items-end justify-between rounded-lg border p-3">
                    <Label htmlFor="damper-ooh" className="cursor-pointer text-sm">Out of hours (+50%)</Label>
                    <Switch id="damper-ooh" checked={damperOoh} onCheckedChange={setDamperOoh} disabled={disabled} />
                  </div>
                </div>
                <Separator />
                <CountRow label="Mechanical dampers" value={mechanicalDampers} onChange={setMechanicalDampers} disabled={disabled} />
                <CountRow label="Automatic dampers" value={automaticDampers} onChange={setAutomaticDampers} disabled={disabled} />
                <div className="grid gap-1.5">
                  <Label>Access equipment cost (£)</Label>
                  <Input type="number" min={0} className="h-9 sm:w-48" value={damperAccessCost || ''} onChange={(e) => setDamperAccessCost(Math.max(0, Number.parseFloat(e.target.value) || 0))} disabled={disabled} />
                </div>
              </TabsContent>

              {/* MONITORING */}
              <TabsContent value="monitoring" className="mt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the quantity of each signalling device. Prices come from the CASH price list.
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Fire &amp; intruder signalling</p>
                  {rates.monitoringParts.map((p) => (
                    <div key={p.partNo} className="flex items-center justify-between gap-3 py-1">
                      <div className="min-w-0">
                        <span className="text-sm">{p.label}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{GBP.format(p.sell)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Fire</span>
                          <Input type="number" min={0} className="h-8 w-16 text-right tabular-nums" value={fireMonitoring[p.partNo] ? String(fireMonitoring[p.partNo]) : ''} placeholder="0" onChange={(e) => setFireMonitoring({ ...fireMonitoring, [p.partNo]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })} disabled={disabled} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Intruder</span>
                          <Input type="number" min={0} className="h-8 w-16 text-right tabular-nums" value={intruderMonitoring[p.partNo] ? String(intruderMonitoring[p.partNo]) : ''} placeholder="0" onChange={(e) => setIntruderMonitoring({ ...intruderMonitoring, [p.partNo]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })} disabled={disabled} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="grid gap-1.5">
                  <Label>CCTV monitoring cost (£/yr)</Label>
                  <Input type="number" min={0} className="h-9 sm:w-48" value={cctvMonitoringCost || ''} onChange={(e) => setCctvMonitoringCost(Math.max(0, Number.parseFloat(e.target.value) || 0))} disabled={disabled} />
                  <span className="text-xs text-muted-foreground">Sell price applies a 50% margin.</span>
                </div>
              </TabsContent>

              {/* OVERVIEW */}
              <TabsContent value="overview" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Direct services discount (max {maxDiscountPct}%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={maxDiscountPct}
                      className="h-9"
                      value={directDiscount || ''}
                      onChange={(e) =>
                        setDirectDiscount(clampDirectDiscount((Number.parseFloat(e.target.value) || 0) / 100, rates) * 100)
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Monitoring discount (%)</Label>
                    <Input type="number" min={0} max={100} className="h-9" value={monitoringDiscount || ''} onChange={(e) => setMonitoringDiscount(Math.min(100, Math.max(0, Number.parseFloat(e.target.value) || 0)))} disabled={disabled} />
                  </div>
                </div>
                <Separator />
                {hasLines ? (
                  <div className="space-y-1.5">
                    {overview.lines.map((l, i) => (
                      <div key={`${l.description}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          {l.description}
                          {l.coverType ? <span className="text-muted-foreground"> · {l.coverType}</span> : null}
                          {l.visits ? <span className="text-muted-foreground"> · {l.visits} visits</span> : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{GBP.format(l.sell)}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-base font-bold">
                      <span>Total annual price</span>
                      <span className="tabular-nums">{GBP.format(overview.totalSale)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Enter assets in the tabs above to build the maintenance price.
                  </p>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

          {/* Persistent live-pricing summary — always visible while editing any tab */}
          <aside className="hidden w-72 shrink-0 flex-col border-l bg-muted/30 lg:flex">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Live pricing</p>
              <p className="text-xs text-muted-foreground">Updates as you enter assets</p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-4">
                {hasLines ? (
                  overview.lines.map((l, i) => (
                    <div key={`${l.description}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 text-muted-foreground">
                        {l.description}
                        {l.coverType ? ` · ${l.coverType}` : ''}
                        {l.visits ? ` · ${l.visits} visits` : ''}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">{GBP.format(l.sell)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No priced services yet. Enter assets in any tab to build the price.
                  </p>
                )}
              </div>
            </ScrollArea>
            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total / yr</span>
                <span className="text-lg font-bold tabular-nums">{GBP.format(overview.totalSale)}</span>
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-4 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {hasLines ? (
              <>
                {overview.lines.length} line{overview.lines.length === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-foreground tabular-nums">{GBP.format(overview.totalSale)}</span>/yr
              </>
            ) : (
              'No priced services yet'
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={disabled || !hasLines}>
              <Plus className="mr-2 h-4 w-4" />
              Add to quote
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
