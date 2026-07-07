'use client'

/**
 * Installation pricing calculator — a UI over the Excel port in
 * `lib/installation-calculator.ts`. Engineers enter device counts, cable runs,
 * containment and sundries; the dialog live-prices them in the selected mode
 * (Erect Only / Supply Only / Supply & Erect) and, on apply, injects the priced
 * lines into the quote as an "Installation" system.
 */

import { useMemo, useState } from 'react'
import { HardHat, Plus, Trash2 } from 'lucide-react'
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
  calcInstallation,
  resolveInstallationRates,
  resolveCableMetres,
  lineValueForMode,
  totalForMode,
  PRICING_MODE_LABELS,
  type InstallationRates,
  type InstallationResult,
  type InstallationLine,
  type CableEntry,
  type PricingMode,
} from '@/lib/installation-calculator'

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export interface InstallationCalcResult {
  lines: InstallationLine[]
  mode: PricingMode
  total: number
}

interface InstallationCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Saved rate overrides from company settings (null = built-in defaults). */
  savedRates?: Partial<InstallationRates> | null
  disabled?: boolean
  onApply: (result: InstallationCalcResult) => void
}

type CountMap = Record<string, number>

/** A cable run row in the dialog (auto-calc from device count or manual metres). */
interface CableRow {
  key: string
  cableKey: string
  useManual: boolean
  metres: string
  deviceCount: string
  trayPct: string
}

let rowSeq = 0
const newRowId = () => `cable-${Date.now()}-${rowSeq++}`

/** A labelled numeric input storing counts in a CountMap. */
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
        className="h-8 w-24 text-right tabular-nums"
        value={value ? String(value) : ''}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number.parseFloat(e.target.value) || 0))}
        disabled={disabled}
      />
    </div>
  )
}

export function InstallationCalculatorDialog({
  open,
  onOpenChange,
  savedRates,
  disabled,
  onApply,
}: InstallationCalculatorDialogProps) {
  const rates = useMemo(() => resolveInstallationRates(savedRates), [savedRates])

  const [mode, setMode] = useState<PricingMode>('combined')
  const [devices, setDevices] = useState<CountMap>({})
  const [containment, setContainment] = useState<CountMap>({})
  const [sundries, setSundries] = useState<CountMap>({})
  const [cableRows, setCableRows] = useState<CableRow[]>([])

  const defaultTrayPct = String(Math.round(rates.defaultTrayFraction * 100))

  const addCableRow = () =>
    setCableRows((prev) => [
      ...prev,
      {
        key: newRowId(),
        cableKey: rates.cables[0]?.key ?? '',
        useManual: false,
        metres: '',
        deviceCount: '',
        trayPct: defaultTrayPct,
      },
    ])
  const updateCableRow = (key: string, patch: Partial<CableRow>) =>
    setCableRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeCableRow = (key: string) =>
    setCableRows((prev) => prev.filter((r) => r.key !== key))

  // Map the dialog cable rows to engine CableEntry inputs.
  const cableEntries: CableEntry[] = useMemo(
    () =>
      cableRows.map((r) => ({
        cableKey: r.cableKey,
        metres: r.useManual ? Number.parseFloat(r.metres) || 0 : null,
        deviceCount: r.useManual ? null : Number.parseFloat(r.deviceCount) || 0,
        trayFraction: (Number.parseFloat(r.trayPct) || 0) / 100,
      })),
    [cableRows],
  )

  const result: InstallationResult = useMemo(
    () =>
      calcInstallation(
        { devices, cables: cableEntries, containment, sundries },
        rates,
      ),
    [devices, cableEntries, containment, sundries, rates],
  )

  const hasLines = result.lines.length > 0
  const total = totalForMode(result, mode)

  function handleApply() {
    if (!hasLines) return
    onApply({ lines: result.lines, mode, total })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-5xl! flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl!">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" />
            Installation calculator
          </DialogTitle>
          <DialogDescription>
            Enter devices, cable runs, containment and sundries. Prices update live and are added
            to the quote as priced installation lines.
          </DialogDescription>
        </DialogHeader>

        {/* Pricing mode selector */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <Label className="text-sm">Pricing mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as PricingMode)} disabled={disabled}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRICING_MODE_LABELS) as PricingMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PRICING_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {mode === 'erect'
              ? 'Labour only.'
              : mode === 'supply'
                ? 'Materials only (nett + mark-up).'
                : 'Labour + materials.'}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Tabs defaultValue="devices" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b px-4 pt-3">
              <ScrollArea className="w-full whitespace-nowrap">
                <TabsList className="inline-flex w-max">
                  <TabsTrigger value="devices">Devices</TabsTrigger>
                  <TabsTrigger value="cable">Cable</TabsTrigger>
                  <TabsTrigger value="containment">Containment</TabsTrigger>
                  <TabsTrigger value="sundries">Fixings &amp; Sundries</TabsTrigger>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                </TabsList>
              </ScrollArea>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {/* DEVICES */}
                <TabsContent value="devices" className="mt-0 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Device labour is priced at {GBP.format(rates.labourSell)}/hr.
                  </p>
                  <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
                    {rates.devices.map((d) => (
                      <CountRow
                        key={d.key}
                        label={d.label}
                        hint={`${d.installHours}h`}
                        value={devices[d.key] ?? 0}
                        onChange={(n) => setDevices((prev) => ({ ...prev, [d.key]: n }))}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                </TabsContent>

                {/* CABLE */}
                <TabsContent value="cable" className="mt-0 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Auto-calc estimates metres from device count (rounded up to 100m) and splits the
                    run between fabric and tray rates, or enter metres manually.
                  </p>
                  {cableRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No cable runs yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {cableRows.map((row) => {
                        const cable = rates.cables.find((c) => c.key === row.cableKey)
                        const metres = cable
                          ? resolveCableMetres(
                              {
                                cableKey: row.cableKey,
                                metres: row.useManual ? Number.parseFloat(row.metres) || 0 : null,
                                deviceCount: row.useManual ? null : Number.parseFloat(row.deviceCount) || 0,
                              },
                              cable,
                              rates,
                            )
                          : 0
                        return (
                          <div key={row.key} className="rounded-lg border p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Select
                                value={row.cableKey}
                                onValueChange={(v) => updateCableRow(row.key, { cableKey: v })}
                                disabled={disabled}
                              >
                                <SelectTrigger className="h-9 flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {rates.cables.map((c) => (
                                    <SelectItem key={c.key} value={c.key}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeCableRow(row.key)}
                                aria-label="Remove cable run"
                                disabled={disabled}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="grid gap-1.5">
                                <Label className="text-xs">Metres source</Label>
                                <Select
                                  value={row.useManual ? 'manual' : 'auto'}
                                  onValueChange={(v) =>
                                    updateCableRow(row.key, { useManual: v === 'manual' })
                                  }
                                  disabled={disabled}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Auto (from devices)</SelectItem>
                                    <SelectItem value="manual">Manual metres</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {row.useManual ? (
                                <div className="grid gap-1.5">
                                  <Label className="text-xs">Metres</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-9"
                                    value={row.metres}
                                    onChange={(e) => updateCableRow(row.key, { metres: e.target.value })}
                                    disabled={disabled}
                                  />
                                </div>
                              ) : (
                                <div className="grid gap-1.5">
                                  <Label className="text-xs">Device count</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-9"
                                    value={row.deviceCount}
                                    onChange={(e) =>
                                      updateCableRow(row.key, { deviceCount: e.target.value })
                                    }
                                    disabled={disabled}
                                  />
                                </div>
                              )}
                              <div className="grid gap-1.5">
                                <Label className="text-xs">% on tray</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  className="h-9"
                                  value={row.trayPct}
                                  onChange={(e) => updateCableRow(row.key, { trayPct: e.target.value })}
                                  disabled={disabled}
                                />
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {metres} m @ {GBP.format(cable?.nettPerM ?? 0)}/m nett
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addCableRow} disabled={disabled}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add cable run
                  </Button>
                </TabsContent>

                {/* CONTAINMENT */}
                <TabsContent value="containment" className="mt-0 space-y-1">
                  {rates.containment.map((m) => (
                    <CountRow
                      key={m.key}
                      label={m.label}
                      hint={`${m.installHours}h · ${GBP.format(m.nettPer)}`}
                      value={containment[m.key] ?? 0}
                      onChange={(n) => setContainment((prev) => ({ ...prev, [m.key]: n }))}
                      disabled={disabled}
                    />
                  ))}
                </TabsContent>

                {/* SUNDRIES */}
                <TabsContent value="sundries" className="mt-0 space-y-1">
                  {rates.sundries.map((m) => (
                    <CountRow
                      key={m.key}
                      label={m.label}
                      hint={`${m.installHours}h · ${GBP.format(m.nettPer)}`}
                      value={sundries[m.key] ?? 0}
                      onChange={(n) => setSundries((prev) => ({ ...prev, [m.key]: n }))}
                      disabled={disabled}
                    />
                  ))}
                </TabsContent>

                {/* SUMMARY */}
                <TabsContent value="summary" className="mt-0 space-y-4">
                  {hasLines ? (
                    <div className="space-y-1.5">
                      {result.lines.map((l) => (
                        <div key={l.key} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0">
                            {l.description}
                            <span className="text-muted-foreground">
                              {' '}
                              · {l.quantity} {l.unit}
                            </span>
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {GBP.format(lineValueForMode(l, mode))}
                          </span>
                        </div>
                      ))}
                      <Separator className="my-2" />
                      <div className="flex items-center justify-between text-base font-bold">
                        <span>{PRICING_MODE_LABELS[mode]} total</span>
                        <span className="tabular-nums">{GBP.format(total)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Labour {GBP.format(result.totalErect)} · Materials{' '}
                        {GBP.format(result.totalSupply)} · Combined {GBP.format(result.totalCombined)} ·{' '}
                        {result.totalHours} labour hrs
                      </p>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Enter devices, cable or materials in the tabs above to build the price.
                    </p>
                  )}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>

          {/* Persistent live-pricing summary */}
          <aside className="hidden w-72 shrink-0 flex-col border-l bg-muted/30 lg:flex">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Live pricing</p>
              <p className="text-xs text-muted-foreground">{PRICING_MODE_LABELS[mode]}</p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-4">
                {hasLines ? (
                  result.lines.map((l) => (
                    <div key={l.key} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 text-muted-foreground">
                        {l.description} · {l.quantity} {l.unit}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {GBP.format(lineValueForMode(l, mode))}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No priced items yet. Enter quantities in any tab to build the price.
                  </p>
                )}
              </div>
            </ScrollArea>
            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold tabular-nums">{GBP.format(total)}</span>
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-4 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {hasLines ? (
              <>
                {result.lines.length} line{result.lines.length === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-foreground tabular-nums">{GBP.format(total)}</span>
              </>
            ) : (
              'No priced items yet'
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
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
