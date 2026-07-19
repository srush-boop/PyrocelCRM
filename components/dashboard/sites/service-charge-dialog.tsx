'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { Loader2, Plus, Pencil, Power, Trash2, X } from 'lucide-react'
import {
  getServiceChargeContext,
  createRecurringCharge,
  updateRecurringCharge,
  setRecurringChargeActive,
  deleteRecurringCharge,
  type ServiceChargeContext,
} from '@/lib/actions/recurring-charges'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
  MONTH_LABELS,
  annualOccurrences,
  perPeriodFromAnnual,
  annualFromPerPeriod,
  splitFullValue,
} from '@/lib/billing/recurring'
import { resolveNominalCode, nominalSourceLabel } from '@/lib/billing/nominal-codes'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import type {
  RecurringCharge,
  RecurringFrequency,
  RecurringPriceBasis,
  RecurringTiming,
} from '@/lib/types/database'

interface ServiceChargeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteServiceId: string
  /** Open straight into edit mode for the service's existing (active) charge. */
  autoEdit?: boolean
}

  const NO_TEMPLATE = '__custom__'

const penceFromPounds = (pounds: string) =>
  Math.max(0, Math.round((Number.parseFloat(pounds) || 0) * 100))
const poundsFromPence = (pence: number) => (pence / 100).toFixed(2)
const formatPence = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)

const FREQUENCIES = Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[]
const TIMINGS = Object.keys(RECURRING_TIMING_LABELS) as RecurringTiming[]

// Whole numbers that divide `n` exactly, ascending. These are the only valid
// "visits per cycle" values for a service with `n` visits a year — anything
// else leaves a partial cycle that would under- or over-bill.
const divisorsOf = (n: number): number[] => {
  const out: number[] = []
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d)
  return out
}

const ordinal = (v: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] ?? s[m] ?? s[0]}`
}

export function ServiceChargeDialog({
  open,
  onOpenChange,
  siteServiceId,
  autoEdit = false,
}: ServiceChargeDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ctx, setCtx] = useState<ServiceChargeContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  // When set, the form edits this existing charge instead of creating a new one.
  const [editingCharge, setEditingCharge] = useState<RecurringCharge | null>(null)
  // Id of the charge currently running a toggle/delete action (row spinner).
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  // Form state
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE)
  const [description, setDescription] = useState('')
  const [pricePounds, setPricePounds] = useState('')
  // Whether pricePounds is a per-period price or an annual total.
  const [priceBasis, setPriceBasis] = useState<RecurringPriceBasis>('per_period')
  const [quantity, setQuantity] = useState('1')
  const [frequency, setFrequency] = useState<RecurringFrequency>('annual')
  const [timing, setTiming] = useState<RecurringTiming>('advance')
  // Optional override for how many visits a per_visit cycle splits across.
  // Blank = derive from the service's visit frequency.
  const [visitsPerCycle, setVisitsPerCycle] = useState<string>('')
  const [renewalMonth, setRenewalMonth] = useState<string>('')
  const [billingAccountId, setBillingAccountId] = useState<string>('')
  const [taxCode, setTaxCode] = useState('')
  // Managed nominal code. `nominalManual` tracks whether the user overrode the
  // auto-resolved value, so switching templates doesn't clobber a manual pick.
  const [nominalCodeId, setNominalCodeId] = useState<string | null>(null)
  const [nominalManual, setNominalManual] = useState(false)
  // When on, this charge is billed on its own invoice (via a unique group_key)
  // instead of being grouped with the account's other charges.
  const [individualInvoice, setIndividualInvoice] = useState(false)

  const resetForm = useCallback((c: ServiceChargeContext | null) => {
    setEditingCharge(null)
    setTemplateId(NO_TEMPLATE)
    setDescription('')
    setPricePounds('')
    setPriceBasis('per_period')
    setQuantity('1')
    setFrequency('annual')
    setTiming('advance')
    setVisitsPerCycle('')
    setRenewalMonth('')
    setBillingAccountId(c?.defaultBillingAccountId ?? '')
    setTaxCode('')
    // Auto-resolve to the service type's nominal code (no dept context here).
    setNominalCodeId(c?.serviceTypeNominalCodeId ?? null)
    setNominalManual(false)
    setIndividualInvoice(false)
  }, [])

  // Load an existing charge into the form for editing. The template picker is
  // reset to "custom" since the values now come straight from the charge.
  const startEdit = useCallback((charge: RecurringCharge) => {
    setEditingCharge(charge)
    setError(null)
    setTemplateId(NO_TEMPLATE)
    setDescription(charge.description)
    const basis = charge.price_basis ?? 'per_period'
    setPriceBasis(basis)
    // unit_price_pence is always per-period; show the annual total when that's
    // how the charge was entered.
    setPricePounds(
      poundsFromPence(
        basis === 'annual'
          ? annualFromPerPeriod(charge.unit_price_pence, charge.frequency)
          : charge.unit_price_pence,
      ),
    )
    setQuantity(String(charge.quantity ?? 1))
    setFrequency(charge.frequency)
    setTiming(charge.timing)
    setVisitsPerCycle(charge.visits_per_cycle ? String(charge.visits_per_cycle) : '')
    setRenewalMonth(charge.renewal_month ? String(charge.renewal_month) : '')
    setBillingAccountId(charge.billing_account_id)
    setTaxCode(charge.tax_code ?? '')
    setNominalCodeId(charge.nominal_code_id ?? null)
    // Treat as a manual pick so template switching logic never clobbers it.
    setNominalManual(true)
    // Any group_key means this charge is already forced onto its own invoice.
    setIndividualInvoice(!!charge.group_key)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const c = await getServiceChargeContext(siteServiceId)
    setCtx(c)
    resetForm(c)
    setLoading(false)
  }, [siteServiceId, resetForm])

  // Visits this service makes per year, and the only "visits per cycle" values
  // that divide into it cleanly (so a cycle always finishes within the year).
  const visitsPerYear = Math.max(1, ctx?.serviceVisitsPerYear ?? 1)
  const cycleOptions = divisorsOf(visitsPerYear)

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // "Edit charge" entry point: once the context has loaded, drop straight into
  // editing the service's existing charge (prefer an active one). Runs once per
  // open; if there are no charges yet it silently stays in add mode.
  const autoEditDoneRef = useRef(false)
  useEffect(() => {
    if (!open) {
      autoEditDoneRef.current = false
      return
    }
    if (!autoEdit || autoEditDoneRef.current || !ctx) return
    const charges = ctx.existingCharges
    if (charges.length === 0) return
    autoEditDoneRef.current = true
    startEdit(charges.find((c) => c.active) ?? charges[0])
  }, [open, autoEdit, ctx, startEdit])

  // Self-heal: if a saved override is no longer a clean divisor of the service's
  // current visit count (e.g. legacy data, or the visit frequency changed), drop
  // back to the "every visit" default so the Select never shows a stale value.
  useEffect(() => {
    if (timing !== 'per_visit' || !visitsPerCycle) return
    const n = Number.parseInt(visitsPerCycle, 10)
    if (!cycleOptions.includes(n)) setVisitsPerCycle('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timing, visitsPerCycle, cycleOptions.join(',')])

  // Picking a catalog charge prefills description, price and codes (all still
  // editable). "Custom" clears back to a blank line.
  function handlePickTemplate(value: string) {
    setTemplateId(value)
    if (value === NO_TEMPLATE) return
    const t = ctx?.chargeTemplates.find((x) => x.id === value)
    if (!t) return
    setDescription(t.name)
    // Catalog prices are per-period amounts.
    setPriceBasis('per_period')
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
    if (!renewalMonth) {
      setError('Select a renewal month — the system relies on it to generate this charge.')
      return
    }
    setSaving(true)
    setError(null)
    void (async () => {
      const enteredPence = penceFromPounds(pricePounds)
      const base = {
        billing_account_id: billingAccountId,
        site_service_id: ctx.siteServiceId,
        site_id: ctx.siteId,
        client_id: ctx.clientId,
        description: description.trim(),
        // Store the per-period amount; divide down when entered as an annual total.
        unit_price_pence:
          priceBasis === 'annual' ? perPeriodFromAnnual(enteredPence, frequency) : enteredPence,
        price_basis: priceBasis,
        quantity: Number.parseInt(quantity, 10) || 1,
        tax_code: taxCode || null,
        nominal_code_id: nominalCodeId,
        timing,
        frequency,
        // Only meaningful for per_visit. Store null for the "every visit" default
        // (== the service's visits/year) so it keeps tracking the service; store
        // the explicit divisor only when the user picked a smaller cycle.
        visits_per_cycle:
          timing === 'per_visit' &&
          Number.parseInt(visitsPerCycle, 10) > 0 &&
          Number.parseInt(visitsPerCycle, 10) !== visitsPerYear
            ? Number.parseInt(visitsPerCycle, 10)
            : null,
        renewal_month: Number.parseInt(renewalMonth, 10),
      }
      // Individual-invoice toggle drives group_key: a unique key forces the
      // charge onto its own invoice; clearing it re-groups with the account.
      // Reuse the existing key when already individual so we don't churn it.
      const groupKey = individualInvoice
        ? editingCharge?.group_key || `individual:${crypto.randomUUID()}`
        : null
      // Editing preserves fields this dialog doesn't expose (subcontracting,
      // date window) so an update never wipes them.
      const res = editingCharge
        ? await updateRecurringCharge(editingCharge.id, {
            ...base,
            is_subcontracted: editingCharge.is_subcontracted,
            subcontract_price_pence: editingCharge.subcontract_price_pence,
            group_key: groupKey,
            start_date: editingCharge.start_date,
            end_date: editingCharge.end_date,
          })
        : await createRecurringCharge({ ...base, group_key: groupKey, is_subcontracted: false })
      setSaving(false)
      if (res.error) {
        setError(res.error)
        return
      }
      // Charge saved — refresh the underlying data and close the dialog.
      resetForm(ctx)
      router.refresh()
      onOpenChange(false)
    })()
  }

  // Cancel (deactivate) or reactivate a charge without deleting it.
  function handleToggleActive(charge: RecurringCharge) {
    setRowBusyId(charge.id)
    setError(null)
    void (async () => {
      const res = await setRecurringChargeActive(charge.id, !charge.active)
      setRowBusyId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      // If we were editing this charge, drop back to add mode.
      if (editingCharge?.id === charge.id && ctx) resetForm(ctx)
      await load()
      router.refresh()
    })()
  }

  function handleDelete(charge: RecurringCharge) {
    if (!window.confirm(`Delete "${charge.description}"? This cannot be undone.`)) return
    setRowBusyId(charge.id)
    setError(null)
    void (async () => {
      const res = await deleteRecurringCharge(charge.id)
      setRowBusyId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      if (editingCharge?.id === charge.id && ctx) resetForm(ctx)
      await load()
      router.refresh()
    })()
  }

  // The amount billed on each invoice: the entered value, divided down when the
  // user typed an annual total.
  const perInvoicePence =
    priceBasis === 'annual'
      ? perPeriodFromAnnual(penceFromPounds(pricePounds), frequency)
      : penceFromPounds(pricePounds)

  // The true annual total (× quantity): the entered value itself when in annual
  // mode, otherwise the per-period value multiplied up across the year.
  const annualTotalPence =
    (priceBasis === 'annual'
      ? penceFromPounds(pricePounds)
      : annualFromPerPeriod(penceFromPounds(pricePounds), frequency)) *
    (Number.parseInt(quantity, 10) || 1)

  const hasClient = !!ctx?.clientId
  const noAccounts = (ctx?.billingAccounts.length ?? 0) === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingCharge ? 'Edit recurring charge' : 'Add recurring charge'}</DialogTitle>
          <DialogDescription>
            {ctx ? `For ${ctx.serviceLabel}. ` : ''}
            {editingCharge
              ? 'Update the value, frequency or billing account for this charge.'
              : 'Pick a preconfigured charge or enter a custom one, set the value and invoice frequency, then confirm the billing account.'}
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
        ) : (
          <div className="space-y-4">
            {ctx.existingCharges.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Already on this service
                </p>
                <ul className="space-y-1.5">
                  {ctx.existingCharges.map((c) => {
                    const isEditing = editingCharge?.id === c.id
                    const busy = rowBusyId === c.id
                    return (
                      <li
                        key={c.id}
                        className={`flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm ${
                          isEditing ? 'ring-1 ring-primary' : ''
                        } ${c.active ? '' : 'opacity-60'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{c.description}</span>
                        <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                          {formatPence(c.unit_price_pence * c.quantity)}
                          {c.price_basis === 'annual' && c.frequency !== 'annual' && (
                            <span className="text-xs">
                              (
                              {formatPence(
                                annualFromPerPeriod(c.unit_price_pence, c.frequency) * c.quantity,
                              )}
                              /yr)
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {RECURRING_FREQUENCY_LABELS[c.frequency]}
                          </Badge>
                          {!c.active && <Badge variant="secondary">Inactive</Badge>}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Edit ${c.description}`}
                            disabled={busy || saving}
                            onClick={() => startEdit(c)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={c.active ? `Cancel ${c.description}` : `Reactivate ${c.description}`}
                            title={c.active ? 'Cancel (deactivate)' : 'Reactivate'}
                            disabled={busy || saving}
                            onClick={() => handleToggleActive(c)}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {!c.last_invoiced_date && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label={`Delete ${c.description}`}
                              title="Delete"
                              disabled={busy || saving}
                              onClick={() => handleDelete(c)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {!editingCharge && (
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
                    No catalog charges yet — add some in Settings → Charges, or enter a custom
                    charge below.
                  </p>
                )}
              </div>
            )}

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
                <Label htmlFor="sc-basis">Value entered as</Label>
                <Select
                  value={priceBasis}
                  onValueChange={(v) => setPriceBasis(v as RecurringPriceBasis)}
                >
                  <SelectTrigger id="sc-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_period">Value per period</SelectItem>
                    <SelectItem value="annual">Annual total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-price">
                  {priceBasis === 'annual' ? 'Annual value (£)' : 'Value (£)'}
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-freq">Invoice frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                  disabled={timing === 'per_visit'}
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
                {timing === 'per_visit' && (
                  <p className="text-xs text-muted-foreground">
                    Not used — invoicing is triggered by each completed visit, not a
                    calendar schedule.
                  </p>
                )}
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

            {timing === 'per_visit' && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                <div className="grid gap-1.5">
                  <Label htmlFor="sc-vpc">Visits per cycle</Label>
                  <Select
                    value={visitsPerCycle || String(visitsPerYear)}
                    onValueChange={setVisitsPerCycle}
                  >
                    <SelectTrigger id="sc-vpc" className="sm:max-w-[16rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cycleOptions.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} visit{d === 1 ? '' : 's'}
                          {d === visitsPerYear ? ' — every visit' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The full annual value is split evenly across this many completed visits.
                    Only values that divide cleanly into this service&apos;s{' '}
                    <span className="font-medium text-foreground">
                      {visitsPerYear} visit{visitsPerYear === 1 ? '' : 's'} a year
                    </span>{' '}
                    are offered, so a cycle always finishes within the year.
                  </p>
                </div>
                {(() => {
                  if (annualTotalPence <= 0) {
                    return (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Enter an annual value above to see what gets invoiced per visit.
                      </p>
                    )
                  }
                  const n = Number.parseInt(visitsPerCycle || String(visitsPerYear), 10)
                  const shares = splitFullValue(annualTotalPence, n)
                  const even = shares[0]
                  const last = shares[shares.length - 1]
                  const cyclesPerYear = Math.max(1, Math.round(visitsPerYear / n))
                  const annualBilled = annualTotalPence * cyclesPerYear
                  return (
                    <div className="mt-3 rounded-md bg-background/70 p-3 text-sm">
                      <p className="mb-1 font-medium">What happens</p>
                      {n === 1 ? (
                        <p className="leading-relaxed text-muted-foreground">
                          A full{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(annualTotalPence)}
                          </span>{' '}
                          invoice is raised on every completed visit.
                        </p>
                      ) : last === even ? (
                        <p className="leading-relaxed text-muted-foreground">
                          An invoice of{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(even)}
                          </span>{' '}
                          is raised on each completed visit. Every {n} visits the full{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(annualTotalPence)}
                          </span>{' '}
                          will have been billed, then the cycle repeats.
                        </p>
                      ) : (
                        <p className="leading-relaxed text-muted-foreground">
                          An invoice of{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(even)}
                          </span>{' '}
                          is raised on visits 1&ndash;{n - 1}, then{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(last)}
                          </span>{' '}
                          on the {ordinal(n)} (final) visit of the cycle — completing the full{' '}
                          <span className="font-semibold text-foreground">
                            {formatPence(annualTotalPence)}
                          </span>
                          .
                        </p>
                      )}
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        Across this service&apos;s {visitsPerYear} visit
                        {visitsPerYear === 1 ? '' : 's'} a year that&apos;s{' '}
                        <span className="font-semibold text-foreground">
                          {cyclesPerYear === 1
                            ? `one cycle — ${formatPence(annualBilled)} invoiced a year.`
                            : `${cyclesPerYear} cycles — ${formatPence(annualBilled)} invoiced a year.`}
                        </span>
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="sc-qty">Quantity</Label>
              <Input
                id="sc-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="sm:max-w-[8rem]"
              />
            </div>

            {/* The headline the user is looking for: what actually gets billed on
                each invoice at the chosen frequency. */}
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {timing === 'per_visit' ? 'Full annual value' : 'Amount per invoice'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pricePounds.trim() === ''
                    ? 'Enter a value to see the per-invoice amount.'
                    : timing === 'per_visit'
                      ? 'Billed in shares as visits complete (see split above).'
                      : `${formatPence(annualTotalPence)}/yr ${
                          priceBasis === 'annual' ? 'split across' : 'across'
                        } ${annualOccurrences(frequency)} ${RECURRING_FREQUENCY_LABELS[
                          frequency
                        ].toLowerCase()} invoice${annualOccurrences(frequency) === 1 ? '' : 's'}.`}
                </p>
              </div>
              <span className="whitespace-nowrap text-lg font-semibold tabular-nums">
                {timing === 'per_visit'
                  ? formatPence(annualTotalPence)
                  : formatPence(perInvoicePence * (Number.parseInt(quantity, 10) || 1))}
              </span>
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
                <Label htmlFor="sc-renewal">
                  Renewal month <span className="text-destructive">*</span>
                </Label>
                <Select value={renewalMonth} onValueChange={setRenewalMonth}>
                  <SelectTrigger id="sc-renewal">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_LABELS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Required — the month this charge renews and is invoiced.
                </p>
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

            <label className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={individualInvoice}
                onChange={(e) => setIndividualInvoice(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Invoice this charge individually
                <span className="block text-xs text-muted-foreground">
                  Bills this charge on its own invoice instead of grouping it with the account&apos;s
                  other recurring charges.
                </span>
              </span>
            </label>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
          </div>
        )}

        <DialogFooter>
          {editingCharge ? (
            <Button
              variant="outline"
              onClick={() => ctx && resetForm(ctx)}
              disabled={saving}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancel edit
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || loading || !ctx || !hasClient || noAccounts}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editingCharge ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {editingCharge ? 'Save changes' : 'Add charge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
