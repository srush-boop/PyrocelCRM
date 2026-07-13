'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Loader2, Plus, AlertTriangle } from 'lucide-react'
import {
  getServiceChargeContext,
  createRecurringCharge,
  type ServiceChargeContext,
} from '@/lib/actions/recurring-charges'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
  MONTH_LABELS,
} from '@/lib/billing/recurring'
import { ANNUAL_OCCURRENCES } from '@/lib/billing/projected-revenue'
import { resolveNominalCode, nominalSourceLabel } from '@/lib/billing/nominal-codes'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import type { RecurringFrequency, RecurringTiming } from '@/lib/types/database'

interface ServiceChargeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteServiceId: string
}

const NO_TEMPLATE = '__custom__'
const NO_RENEWAL = '__none__'

const penceFromPounds = (pounds: string) =>
  Math.max(0, Math.round((Number.parseFloat(pounds) || 0) * 100))
const poundsFromPence = (pence: number) => (pence / 100).toFixed(2)
const formatPence = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)

const FREQUENCIES = Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[]
const TIMINGS = Object.keys(RECURRING_TIMING_LABELS) as RecurringTiming[]

export function ServiceChargeDialog({
  open,
  onOpenChange,
  siteServiceId,
}: ServiceChargeDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ctx, setCtx] = useState<ServiceChargeContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE)
  const [description, setDescription] = useState('')
  const [pricePounds, setPricePounds] = useState('')
  const [quantity, setQuantity] = useState('1')
  // Recurring is the only creatable type for now; the toggle is informational.
  const [chargeType, setChargeType] = useState<'recurring' | 'one_off'>('recurring')
  // Whether the entered value is a per-invoice amount or the annual total. We
  // always store the per-invoice unit price; the other figure is derived.
  const [valueBasis, setValueBasis] = useState<'per_period' | 'annual'>('per_period')
  const [frequency, setFrequency] = useState<RecurringFrequency>('annual')
  const [timing, setTiming] = useState<RecurringTiming>('advance')
  const [renewalMonth, setRenewalMonth] = useState<string>(NO_RENEWAL)
  const [billingAccountId, setBillingAccountId] = useState<string>('')
  const [taxCode, setTaxCode] = useState('')
  // Managed nominal code. `nominalManual` tracks whether the user overrode the
  // auto-resolved value, so switching templates doesn't clobber a manual pick.
  const [nominalCodeId, setNominalCodeId] = useState<string | null>(null)
  const [nominalManual, setNominalManual] = useState(false)

  const resetForm = useCallback((c: ServiceChargeContext | null) => {
    setTemplateId(NO_TEMPLATE)
    setDescription('')
    setPricePounds('')
    setQuantity('1')
    setChargeType('recurring')
    setValueBasis('per_period')
    setFrequency('annual')
    setTiming('advance')
    setRenewalMonth(NO_RENEWAL)
    setBillingAccountId(c?.defaultBillingAccountId ?? '')
    setTaxCode('')
    // Auto-resolve to the service type's nominal code (no dept context here).
    setNominalCodeId(c?.serviceTypeNominalCodeId ?? null)
    setNominalManual(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const c = await getServiceChargeContext(siteServiceId)
    setCtx(c)
    resetForm(c)
    setLoading(false)
  }, [siteServiceId, resetForm])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // Picking a catalog charge prefills description, price and codes (all still
  // editable). "Custom" clears back to a blank line.
  function handlePickTemplate(value: string) {
    setTemplateId(value)
    if (value === NO_TEMPLATE) return
    const t = ctx?.chargeTemplates.find((x) => x.id === value)
    if (!t) return
    setDescription(t.name)
    setPricePounds(poundsFromPence(t.default_unit_price_pence))
    setTaxCode(t.default_tax_code ?? '')
    // Only auto-move the nominal if the user hasn't manually overridden it.
    // The template's own code wins, else fall back to the service type's.
    if (!nominalManual) {
      setNominalCodeId(t.nominal_code_id ?? ctx?.serviceTypeNominalCodeId ?? null)
    }
  }

  // Which fallback the current auto value came from (for the hint under the field).
  const resolvedSource = resolveNominalCode({
    explicitId: templateId !== NO_TEMPLATE ? ctx?.chargeTemplates.find((x) => x.id === templateId)?.nominal_code_id ?? null : null,
    serviceTypeId: ctx?.serviceTypeNominalCodeId ?? null,
  }).source

  // Value maths. We store a per-invoice unit price; the annual figure is just
  // (unit × qty × occurrences). When the user enters an annual total instead, we
  // back it out to the per-invoice unit price for storage.
  const qty = Number.parseInt(quantity, 10) || 1
  const occurrences = ANNUAL_OCCURRENCES[frequency]
  const enteredPence = penceFromPounds(pricePounds)
  const unitPricePence =
    valueBasis === 'annual' ? Math.round(enteredPence / occurrences / qty) : enteredPence
  const perInvoiceTotalPence = unitPricePence * qty
  const annualTotalPence = perInvoiceTotalPence * occurrences
  const perLabel = RECURRING_FREQUENCY_LABELS[frequency].toLowerCase()

  function handleSave() {
    if (!ctx) return
    if (!description.trim()) {
      setError('A description is required.')
      return
    }
    if (!billingAccountId) {
      setError('Select a billing account.')
      return
    }
    setSaving(true)
    setError(null)
    void (async () => {
      const res = await createRecurringCharge({
        billing_account_id: billingAccountId,
        site_service_id: ctx.siteServiceId,
        site_id: ctx.siteId,
        client_id: ctx.clientId,
        description: description.trim(),
        // Always store the per-invoice unit price, derived from the annual total
        // when the user entered value on an annual basis.
        unit_price_pence: unitPricePence,
        quantity: qty,
        tax_code: taxCode || null,
        nominal_code_id: nominalCodeId,
        timing,
        frequency,
        renewal_month: renewalMonth === NO_RENEWAL ? null : Number.parseInt(renewalMonth, 10),
        is_subcontracted: false,
      })
      setSaving(false)
      if (res.error) {
        setError(res.error)
        return
      }
      await load() // refresh the existing-charges list
      resetForm(ctx)
      router.refresh()
    })()
  }

  const hasClient = !!ctx?.clientId
  const noAccounts = (ctx?.billingAccounts.length ?? 0) === 0
  // Recurring charges can only attach to recurring services.
  const notRecurring = !!ctx && !ctx.isRecurringService

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add recurring charge</DialogTitle>
          <DialogDescription>
            {ctx ? `For ${ctx.serviceLabel}. ` : ''}Pick a preconfigured charge or enter a custom
            one, set the value and invoice frequency, then confirm the billing account.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ctx ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Could not load this service.
          </p>
        ) : !hasClient ? (
          <p className="rounded-md border bg-muted/40 py-6 text-center text-sm text-muted-foreground">
            This site is not linked to a client, so charges cannot be billed yet.
          </p>
        ) : noAccounts ? (
          <p className="rounded-md border bg-muted/40 py-6 text-center text-sm text-muted-foreground">
            This client has no billing accounts. Add one from the client record first.
          </p>
        ) : notRecurring ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">This isn&apos;t a recurring service</p>
              <p className="mt-1 text-amber-800">
                Recurring charges can only be added to recurring (PPM) services. For ad-hoc work on{' '}
                {ctx.serviceLabel}, raise the charge on an invoice directly instead.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Charge type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChargeType('recurring')}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    chargeType === 'recurring'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="font-medium">Recurring</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Billed on a repeating cadence
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-dashed p-3 text-left text-sm opacity-60"
                  title="Add one-off charges on an invoice directly"
                >
                  <span className="font-medium">One-off</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Add on an invoice directly
                  </span>
                </button>
              </div>
            </div>

            {ctx.existingCharges.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Already on this service
                </p>
                <ul className="space-y-1">
                  {ctx.existingCharges.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{c.description}</span>
                      <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                        {formatPence(c.unit_price_pence * c.quantity)}
                        <Badge variant="outline" className="text-xs">
                          {RECURRING_FREQUENCY_LABELS[c.frequency]}
                        </Badge>
                        {!c.active && <Badge variant="secondary">Inactive</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="sc-template">Preconfigured charge</Label>
              <Select value={templateId} onValueChange={handlePickTemplate}>
                <SelectTrigger id="sc-template">
                  <SelectValue placeholder="Choose a charge" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Custom charge…</SelectItem>
                  {ctx.chargeTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {formatPence(t.default_unit_price_pence)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ctx.chargeTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No catalog charges yet — add some in Settings → Charges, or enter a custom charge
                  below.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="sc-desc">Description</Label>
              <Input
                id="sc-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Annual fire alarm maintenance"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-freq">Invoice frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                >
                  <SelectTrigger id="sc-freq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {RECURRING_FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-timing">Billed</Label>
                <Select value={timing} onValueChange={(v) => setTiming(v as RecurringTiming)}>
                  <SelectTrigger id="sc-timing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMINGS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {RECURRING_TIMING_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Value entry: type either the per-invoice amount OR the annual
                total, and the other is derived so the cadence is unambiguous. */}
            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <Label className="text-sm">Value</Label>
                <div className="inline-flex rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setValueBasis('per_period')}
                    className={`rounded px-2 py-1 transition-colors ${
                      valueBasis === 'per_period'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Per invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => setValueBasis('annual')}
                    className={`rounded px-2 py-1 transition-colors ${
                      valueBasis === 'annual'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Annual
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="sc-price" className="text-xs text-muted-foreground">
                    {valueBasis === 'annual' ? 'Annual value (£)' : 'Amount per invoice (£)'}
                  </Label>
                  <Input
                    id="sc-price"
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={pricePounds}
                    onChange={(e) => setPricePounds(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sc-qty" className="text-xs text-muted-foreground">
                    Quantity
                  </Label>
                  <Input
                    id="sc-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{formatPence(perInvoiceTotalPence)}</span>{' '}
                  <span className="text-muted-foreground">per {perLabel} invoice</span>
                </span>
                <span className="text-muted-foreground">
                  {formatPence(annualTotalPence)} / year
                  {occurrences > 1 ? ` · ${occurrences} invoices` : ''}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-account">Billing account</Label>
                <Select value={billingAccountId} onValueChange={setBillingAccountId}>
                  <SelectTrigger id="sc-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {ctx.billingAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.id === ctx.defaultBillingAccountId ? ' (default)' : ''}
                        {a.status !== 'live' ? ` — ${a.status}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-renewal">Renewal month</Label>
                <Select value={renewalMonth} onValueChange={setRenewalMonth}>
                  <SelectTrigger id="sc-renewal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RENEWAL}>None</SelectItem>
                    {MONTH_LABELS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-tax">Tax code</Label>
                <Input
                  id="sc-tax"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  placeholder="Account default"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-nominal">Nominal code</Label>
                <NominalCodeSelect
                  id="sc-nominal"
                  value={nominalCodeId}
                  onChange={(id) => {
                    setNominalCodeId(id)
                    setNominalManual(true)
                  }}
                  codes={ctx.nominalCodes}
                  noneLabel="None"
                />
                {!nominalManual && resolvedSource && (
                  <p className="text-xs text-muted-foreground">
                    Auto {nominalSourceLabel(resolvedSource)}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !ctx || !hasClient || noAccounts || notRecurring}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
