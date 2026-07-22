'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus,
  Pencil,
  X,
  Repeat,
  Power,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  BillingAccount,
  RecurringCharge,
  RecurringFrequency,
  RecurringPriceBasis,
  RecurringTiming,
} from '@/lib/types/database'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
  MONTH_LABELS,
  marginPct,
  annualOccurrences,
  perPeriodFromAnnual,
  annualFromPerPeriod,
} from '@/lib/billing/recurring'
import { formatPence } from '@/lib/billing/invoices'
import {
  getRecurringChargesForAccount,
  getLinkableServices,
  createRecurringCharge,
  updateRecurringCharge,
  setRecurringChargeActive,
  deleteRecurringCharge,
  type RecurringChargeInput,
  type LinkableService,
} from '@/lib/actions/recurring-charges'
import { getNominalCodes } from '@/lib/actions/nominal-codes'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import type { NominalCode } from '@/lib/types/database'
import { Link2 } from 'lucide-react'

interface RecurringChargesManagerProps {
  account: BillingAccount
}

interface FormState {
  description: string
  poundsPrice: string
  /** Whether poundsPrice is a per-period price or an annual total. */
  priceBasis: RecurringPriceBasis
  quantity: string
  frequency: RecurringFrequency
  timing: RecurringTiming
  renewalMonth: string // '' = none, else '1'..'12'
  groupKey: string
  isSubcontracted: boolean
  poundsSubcontract: string
  nominalCodeId: string | null
  siteServiceId: string // '' = standalone (no service link)
  siteId: string
}

const EMPTY_FORM: FormState = {
  description: '',
  poundsPrice: '',
  priceBasis: 'per_period',
  quantity: '1',
  frequency: 'annual',
  timing: 'arrears',
  renewalMonth: '',
  groupKey: '',
  isSubcontracted: false,
  poundsSubcontract: '',
  nominalCodeId: null,
  siteServiceId: '',
  siteId: '',
}

const NO_SERVICE = '__standalone__'

function poundsToPence(pounds: string): number {
  const n = Number.parseFloat(pounds)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function penceToPounds(pence: number | null | undefined): string {
  if (pence == null) return ''
  return (pence / 100).toFixed(2)
}

export function RecurringChargesManager({ account }: RecurringChargesManagerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [charges, setCharges] = useState<RecurringCharge[]>([])
  const [services, setServices] = useState<LinkableService[]>([])
  const [nominalCodes, setNominalCodes] = useState<NominalCode[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null) // null hidden | 'new' | id
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    const [rows, svc, codes] = await Promise.all([
      getRecurringChargesForAccount(account.id),
      getLinkableServices(account.client_id),
      getNominalCodes(),
    ])
    setCharges(rows)
    setServices(svc)
    setNominalCodes(codes)
    setLoading(false)
  }, [account.id, account.client_id])

  useEffect(() => {
    if (open) {
      load()
      setEditing(null)
      setForm(EMPTY_FORM)
    }
  }, [open, load])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startAdd() {
    setForm({ ...EMPTY_FORM, nominalCodeId: null })
    setEditing('new')
  }

  function startEdit(charge: RecurringCharge) {
    const basis = charge.price_basis ?? 'per_period'
    // When stored as an annual total, show the annual figure in the field
    // (unit_price_pence is always the per-period amount).
    const shownPence =
      basis === 'annual'
        ? annualFromPerPeriod(charge.unit_price_pence, charge.frequency)
        : charge.unit_price_pence
    setForm({
      description: charge.description,
      poundsPrice: penceToPounds(shownPence),
      priceBasis: basis,
      quantity: String(charge.quantity ?? 1),
      frequency: charge.frequency,
      timing: charge.timing,
      renewalMonth: charge.renewal_month ? String(charge.renewal_month) : '',
      groupKey: charge.group_key ?? '',
      isSubcontracted: charge.is_subcontracted,
      poundsSubcontract: penceToPounds(charge.subcontract_price_pence),
      nominalCodeId: charge.nominal_code_id ?? null,
      siteServiceId: charge.site_service_id ?? '',
      siteId: charge.site_id ?? '',
    })
    setEditing(charge.id)
  }

  // Linking to a service also captures its site and, when the description is
  // still blank, prefills a sensible "{Site} — {Service type}" label.
  function handlePickService(value: string) {
    if (value === NO_SERVICE) {
      setForm((prev) => ({ ...prev, siteServiceId: '', siteId: '' }))
      return
    }
    const svc = services.find((s) => s.site_service_id === value)
    if (!svc) return
    setForm((prev) => ({
      ...prev,
      siteServiceId: svc.site_service_id,
      siteId: svc.site_id,
      description: prev.description.trim()
        ? prev.description
        : `${svc.site_name} — ${svc.service_type_name}`,
    }))
  }

  function buildInput(): RecurringChargeInput {
    const enteredPence = poundsToPence(form.poundsPrice)
    // The DB always stores the per-period amount; divide down annual entries.
    const perPeriodPence =
      form.priceBasis === 'annual'
        ? perPeriodFromAnnual(enteredPence, form.frequency)
        : enteredPence
    return {
      billing_account_id: account.id,
      client_id: account.client_id,
      site_service_id: form.siteServiceId || null,
      site_id: form.siteId || null,
      description: form.description,
      unit_price_pence: perPeriodPence,
      price_basis: form.priceBasis,
      quantity: Number.parseFloat(form.quantity) || 1,
      // VAT/tax code is set at company level; no per-charge override.
      tax_code: null,
      nominal_code_id: form.nominalCodeId,
      timing: form.timing,
      frequency: form.frequency,
      renewal_month: Number(form.renewalMonth),
      group_key: form.groupKey || null,
      is_subcontracted: form.isSubcontracted,
      subcontract_price_pence: form.isSubcontracted ? poundsToPence(form.poundsSubcontract) : null,
    }
  }

  async function handleSave() {
    if (!form.description.trim()) {
      toast.error('Enter a description')
      return
    }
    if (!form.renewalMonth) {
      toast.error('Select a renewal month — the system relies on it to generate this charge')
      return
    }
    setSaving(true)
    const input = buildInput()
    const result =
      editing === 'new'
        ? await createRecurringCharge(input)
        : await updateRecurringCharge(editing as string, input)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(editing === 'new' ? 'Recurring charge added' : 'Recurring charge updated')
    setEditing(null)
    setForm(EMPTY_FORM)
    load()
    router.refresh()
  }

  async function handleToggleActive(charge: RecurringCharge) {
    const result = await setRecurringChargeActive(charge.id, !charge.active)
    if (result.error) {
      toast.error(result.error)
      return
    }
    load()
    router.refresh()
  }

  async function handleDelete(charge: RecurringCharge) {
    if (!window.confirm(`Delete "${charge.description}"? This cannot be undone.`)) return
    const result = await deleteRecurringCharge(charge.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Recurring charge deleted')
    load()
    router.refresh()
  }

  // Live margin readout for the form.
  const liveMargin = form.isSubcontracted
    ? marginPct({
        is_subcontracted: true,
        unit_price_pence: poundsToPence(form.poundsPrice),
        subcontract_price_pence: poundsToPence(form.poundsSubcontract),
      })
    : null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Repeat className="h-3.5 w-3.5" />
        Recurring charges
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Recurring charges — {account.name}</DialogTitle>
            <DialogDescription>
              Standing charges billed on a cadence (service contracts, monitoring, rentals).
              These are invoiced separately from ad-hoc call charges.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : charges.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
                <Repeat className="h-7 w-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No recurring charges yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {charges.map((charge) => {
                  const pct = marginPct(charge)
                  return (
                    <li
                      key={charge.id}
                      className={`rounded-md border p-3 ${charge.active ? '' : 'opacity-60'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{charge.description}</span>
                            {!charge.active && (
                              <Badge variant="secondary" className="text-xs">
                                Inactive
                              </Badge>
                            )}
                            {charge.is_subcontracted && (
                              <Badge variant="outline" className="text-xs">
                                Subcontracted
                              </Badge>
                            )}
                            {charge.site_service_id && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Link2 className="h-3 w-3" />
                                Linked to service
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {formatPence(charge.unit_price_pence)}
                              {charge.quantity !== 1 ? ` × ${charge.quantity}` : ''}
                            </span>
                            {charge.price_basis === 'annual' && charge.frequency !== 'annual' && (
                              <span>
                                {formatPence(
                                  annualFromPerPeriod(charge.unit_price_pence, charge.frequency),
                                )}
                                /yr
                              </span>
                            )}
                            <span>{RECURRING_FREQUENCY_LABELS[charge.frequency]}</span>
                            <span>{RECURRING_TIMING_LABELS[charge.timing]}</span>
                            {charge.renewal_month && (
                              <span>Renews {MONTH_LABELS[charge.renewal_month - 1]}</span>
                            )}
                            {charge.group_key && <span>Group: {charge.group_key}</span>}
                          </div>
                          {charge.is_subcontracted && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted-foreground">
                                Buy {formatPence(charge.subcontract_price_pence ?? 0)}
                              </span>
                              {pct != null && (
                                <Badge
                                  variant="outline"
                                  className={
                                    pct >= 30
                                      ? 'border-green-600/40 text-green-700 dark:text-green-400'
                                      : pct >= 10
                                        ? 'border-amber-600/40 text-amber-700 dark:text-amber-400'
                                        : 'border-red-600/40 text-red-700 dark:text-red-400'
                                  }
                                >
                                  {pct.toFixed(1)}% margin
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Edit ${charge.description}`}
                            onClick={() => startEdit(charge)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={charge.active ? 'Deactivate' : 'Reactivate'}
                            onClick={() => handleToggleActive(charge)}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          {!charge.last_invoiced_date && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              aria-label={`Delete ${charge.description}`}
                              onClick={() => handleDelete(charge)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {editing === null && (
              <Button onClick={startAdd} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Add recurring charge
              </Button>
            )}
          </div>

          {editing !== null && (
            <div className="space-y-4 rounded-md border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {editing === 'new' ? 'Add recurring charge' : 'Edit recurring charge'}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Cancel"
                  onClick={() => {
                    setEditing(null)
                    setForm(EMPTY_FORM)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rc-service">
                  Linked service <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.siteServiceId || NO_SERVICE}
                  onValueChange={handlePickService}
                >
                  <SelectTrigger id="rc-service">
                    <SelectValue placeholder="Standalone charge (no service)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SERVICE}>Standalone charge (no service)</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.site_service_id} value={s.site_service_id}>
                        {s.site_name} — {s.service_type_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link this charge to a scheduled service, or leave standalone for fees with no
                  visit (monitoring, rentals).
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rc-desc">Description</Label>
                <Input
                  id="rc-desc"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="e.g. Annual fire alarm maintenance contract"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="rc-basis">Price entered as</Label>
                  <Select
                    value={form.priceBasis}
                    onValueChange={(v) => set('priceBasis', v as RecurringPriceBasis)}
                  >
                    <SelectTrigger id="rc-basis">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_period">Price per period</SelectItem>
                      <SelectItem value="annual">Annual total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rc-price">
                    {form.priceBasis === 'annual' ? 'Annual sell price (£)' : 'Sell price (£)'}
                  </Label>
                  <Input
                    id="rc-price"
                    inputMode="decimal"
                    value={form.poundsPrice}
                    onChange={(e) => set('poundsPrice', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="rc-qty">Quantity</Label>
                  <Input
                    id="rc-qty"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => set('quantity', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rc-freq">Frequency</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={(v) => set('frequency', v as RecurringFrequency)}
                  >
                    <SelectTrigger id="rc-freq">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {RECURRING_FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Derived amount readout, so the user can sanity-check the split. */}
              {form.poundsPrice.trim() !== '' && (
                <p className="text-xs text-muted-foreground">
                  {form.priceBasis === 'annual'
                    ? `Bills ${formatPence(
                        perPeriodFromAnnual(poundsToPence(form.poundsPrice), form.frequency),
                      )} each ${RECURRING_FREQUENCY_LABELS[form.frequency].toLowerCase()} period (${annualOccurrences(
                        form.frequency,
                      )}× per year).`
                    : `Annual total ${formatPence(
                        annualFromPerPeriod(poundsToPence(form.poundsPrice), form.frequency),
                      )} (${annualOccurrences(form.frequency)}× ${formatPence(
                        poundsToPence(form.poundsPrice),
                      )}).`}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="rc-timing">Billing timing</Label>
                  <Select
                    value={form.timing}
                    onValueChange={(v) => set('timing', v as RecurringTiming)}
                  >
                    <SelectTrigger id="rc-timing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RECURRING_TIMING_LABELS) as RecurringTiming[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {RECURRING_TIMING_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rc-renewal">
                    Renewal month <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.renewalMonth}
                    onValueChange={(v) => set('renewalMonth', v)}
                  >
                    <SelectTrigger id="rc-renewal">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((label, i) => (
                        <SelectItem key={label} value={String(i + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Required — the month this charge renews and is invoiced.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rc-group">
                    Group key <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="rc-group"
                    value={form.groupKey}
                    onChange={(e) => set('groupKey', e.target.value)}
                    placeholder="Separate invoice label"
                  />
                </div>
              </div>

              {/* Subcontract */}
              <div className="space-y-3 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="rc-subc" className="text-sm font-medium">
                      Subcontracted
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Record the buy price to track profit margin.
                    </p>
                  </div>
                  <Switch
                    id="rc-subc"
                    checked={form.isSubcontracted}
                    onCheckedChange={(v) => set('isSubcontracted', v)}
                  />
                </div>
                {form.isSubcontracted && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="rc-buy">Subcontract price (£)</Label>
                      <Input
                        id="rc-buy"
                        inputMode="decimal"
                        value={form.poundsSubcontract}
                        onChange={(e) => set('poundsSubcontract', e.target.value)}
                        placeholder="0.00"
                        className="w-40"
                      />
                    </div>
                    {liveMargin != null && (
                      <Badge
                        variant="outline"
                        className={
                          liveMargin >= 30
                            ? 'border-green-600/40 text-green-700 dark:text-green-400'
                            : liveMargin >= 10
                              ? 'border-amber-600/40 text-amber-700 dark:text-amber-400'
                              : 'border-red-600/40 text-red-700 dark:text-red-400'
                        }
                      >
                        {liveMargin.toFixed(1)}% margin
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="rc-nominal">
                    Nominal code <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <NominalCodeSelect
                    id="rc-nominal"
                    value={form.nominalCodeId}
                    onChange={(id) => set('nominalCodeId', id)}
                    codes={nominalCodes}
                    noneLabel="None"
                  />
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || !form.description.trim()}
                className="gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editing === 'new' ? 'Add charge' : 'Save changes'}
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
