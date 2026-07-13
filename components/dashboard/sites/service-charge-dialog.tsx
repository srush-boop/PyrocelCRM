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
  const [renewalMonth, setRenewalMonth] = useState<string>(NO_RENEWAL)
  const [billingAccountId, setBillingAccountId] = useState<string>('')
  const [taxCode, setTaxCode] = useState('')
  // Managed nominal code. `nominalManual` tracks whether the user overrode the
  // auto-resolved value, so switching templates doesn't clobber a manual pick.
  const [nominalCodeId, setNominalCodeId] = useState<string | null>(null)
  const [nominalManual, setNominalManual] = useState(false)

  const resetForm = useCallback((c: ServiceChargeContext | null) => {
    setEditingCharge(null)
    setTemplateId(NO_TEMPLATE)
    setDescription('')
    setPricePounds('')
    setPriceBasis('per_period')
    setQuantity('1')
    setFrequency('annual')
    setTiming('advance')
    setRenewalMonth(NO_RENEWAL)
    setBillingAccountId(c?.defaultBillingAccountId ?? '')
    setTaxCode('')
    // Auto-resolve to the service type's nominal code (no dept context here).
    setNominalCodeId(c?.serviceTypeNominalCodeId ?? null)
    setNominalManual(false)
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
    setRenewalMonth(charge.renewal_month ? String(charge.renewal_month) : NO_RENEWAL)
    setBillingAccountId(charge.billing_account_id)
    setTaxCode(charge.tax_code ?? '')
    setNominalCodeId(charge.nominal_code_id ?? null)
    // Treat as a manual pick so template switching logic never clobbers it.
    setNominalManual(true)
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
        renewal_month: renewalMonth === NO_RENEWAL ? null : Number.parseInt(renewalMonth, 10),
      }
      // Editing preserves fields this dialog doesn't expose (subcontracting,
      // grouping, date window) so an update never wipes them.
      const res = editingCharge
        ? await updateRecurringCharge(editingCharge.id, {
            ...base,
            is_subcontracted: editingCharge.is_subcontracted,
            subcontract_price_pence: editingCharge.subcontract_price_pence,
            group_key: editingCharge.group_key,
            start_date: editingCharge.start_date,
            end_date: editingCharge.end_date,
          })
        : await createRecurringCharge({ ...base, is_subcontracted: false })
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
                <p className="text-sm font-medium">Amount per invoice</p>
                <p className="text-xs text-muted-foreground">
                  {pricePounds.trim() === ''
                    ? 'Enter a value to see the per-invoice amount.'
                    : `${formatPence(annualTotalPence)}/yr ${
                        priceBasis === 'annual' ? 'split across' : 'across'
                      } ${annualOccurrences(frequency)} ${RECURRING_FREQUENCY_LABELS[
                        frequency
                      ].toLowerCase()} invoice${annualOccurrences(frequency) === 1 ? '' : 's'}.`}
                </p>
              </div>
              <span className="whitespace-nowrap text-lg font-semibold tabular-nums">
                {formatPence(perInvoicePence * (Number.parseInt(quantity, 10) || 1))}
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
