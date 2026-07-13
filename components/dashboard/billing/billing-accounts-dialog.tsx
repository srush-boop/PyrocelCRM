'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Pencil, Star, Building2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Client, BillingAccount, BillingAccountStatus } from '@/lib/types/database'
import { BillingStatusBadge } from './billing-status-badge'
import { RecurringChargesManager } from './recurring-charges-manager'
import {
  createBillingAccount,
  updateBillingAccount,
  setBillingAccountStatus,
  setDefaultBillingAccount,
  type BillingAccountInput,
} from '@/lib/actions/billing-accounts'

interface BillingAccountsDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMPTY_FORM: BillingAccountInput = {
  name: '',
  sage_account_ref: '',
  invoice_address: '',
  invoice_postcode: '',
  invoice_contact_name: '',
  invoice_email: '',
  invoice_phone: '',
  payment_terms_days: 30,
  default_tax_code: 'T1',
  default_nominal_code: '4000',
  billing_frequency: 'on_demand',
  rate_card_id: null,
  notes: '',
}

// Select sentinel: an empty string value isn't allowed by Radix Select.
const INHERIT_DEFAULT = '__default__'

export function BillingAccountsDialog({ client, open, onOpenChange }: BillingAccountsDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [accounts, setAccounts] = useState<BillingAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // null = form hidden; 'new' = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<BillingAccountInput>(EMPTY_FORM)
  // Active rate cards for the override picker (label + which one is the default).
  const [rateCards, setRateCards] = useState<{ id: string; name: string; is_default: boolean }[]>(
    [],
  )

  const loadRateCards = useCallback(async () => {
    const { data } = await supabase
      .from('rate_cards')
      .select('id, name, is_default')
      .eq('active', true)
      .order('is_default', { ascending: false })
      .order('name')
    setRateCards((data ?? []) as { id: string; name: string; is_default: boolean }[])
  }, [supabase])

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('billing_accounts')
      .select('*')
      .eq('client_id', client.id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })
    if (error) {
      toast.error('Could not load billing accounts')
    } else {
      setAccounts((data || []) as BillingAccount[])
    }
    setLoading(false)
  }, [supabase, client.id])

  useEffect(() => {
    if (open) {
      loadAccounts()
      loadRateCards()
      setEditing(null)
      setForm(EMPTY_FORM)
    }
  }, [open, loadAccounts, loadRateCards])

  function set<K extends keyof BillingAccountInput>(key: K, value: BillingAccountInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  function startEdit(account: BillingAccount) {
    setForm({
      name: account.name,
      sage_account_ref: account.sage_account_ref ?? '',
      invoice_address: account.invoice_address ?? '',
      invoice_postcode: account.invoice_postcode ?? '',
      invoice_contact_name: account.invoice_contact_name ?? '',
      invoice_email: account.invoice_email ?? '',
      invoice_phone: account.invoice_phone ?? '',
      payment_terms_days: account.payment_terms_days,
      default_tax_code: account.default_tax_code,
      default_nominal_code: account.default_nominal_code,
      billing_frequency: account.billing_frequency ?? 'on_demand',
      rate_card_id: account.rate_card_id ?? null,
      notes: account.notes ?? '',
    })
    setEditing(account.id)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Enter an account name')
      return
    }
    setSaving(true)
    const result =
      editing === 'new'
        ? await createBillingAccount(client.id, form)
        : await updateBillingAccount(editing as string, client.id, form)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(editing === 'new' ? 'Billing account added' : 'Billing account updated')
    setEditing(null)
    setForm(EMPTY_FORM)
    loadAccounts()
    router.refresh()
  }

  async function handleSetDefault(account: BillingAccount) {
    const result = await setDefaultBillingAccount(account.id, client.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`${account.name} is now the default account`)
    loadAccounts()
    router.refresh()
  }

  async function handleStatusChange(account: BillingAccount, status: BillingAccountStatus) {
    let reason: string | null = null
    // Suspended/closed are accounts decisions — capture why for the audit trail.
    if (status !== 'live') {
      reason = window.prompt(
        `Reason for marking "${account.name}" as ${status === 'suspended' ? 'suspended' : 'closed'}?`,
        account.status_reason ?? '',
      )
      // Cancelled the prompt entirely — abort.
      if (reason === null) return
    }
    const result = await setBillingAccountStatus(account.id, client.id, status, reason)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Status updated')
    loadAccounts()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Billing accounts — {client.name}</DialogTitle>
          <DialogDescription>
            Each billing account is a billable entity (sub-client) with its own Sage A/C ref
            and invoice address. Sites and services are invoiced under their account, falling
            back to the default.
          </DialogDescription>
        </DialogHeader>

        {/* Existing accounts */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
              <Building2 className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No billing accounts yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {accounts.map((account) => (
                <li key={account.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{account.name}</span>
                        <BillingStatusBadge status={account.status} />
                        {account.is_default && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          Sage ref:{' '}
                          {account.sage_account_ref ? (
                            <span className="font-mono text-foreground">
                              {account.sage_account_ref}
                            </span>
                          ) : (
                            <span className="italic">not set</span>
                          )}
                        </span>
                        <span>{account.payment_terms_days} day terms</span>
                        <span>
                          {account.default_tax_code} · {account.default_nominal_code}
                        </span>
                      </div>
                      {account.invoice_address && (
                        <p className="text-xs text-muted-foreground">
                          {account.invoice_address}
                          {account.invoice_postcode ? `, ${account.invoice_postcode}` : ''}
                        </p>
                      )}
                      {account.status !== 'live' && account.status_reason && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {account.status === 'suspended' ? 'Suspended' : 'Closed'}:{' '}
                          {account.status_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => startEdit(account)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Row actions: status + default */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select
                      value={account.status}
                      onValueChange={(v) => handleStatusChange(account, v as BillingAccountStatus)}
                    >
                      <SelectTrigger className="h-8 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">Live (contracted)</SelectItem>
                        <SelectItem value="suspended">Suspended (hold)</SelectItem>
                        <SelectItem value="dead">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <RecurringChargesManager account={account} />
                    {!account.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto gap-1.5"
                        onClick={() => handleSetDefault(account)}
                      >
                        <Star className="h-3.5 w-3.5" />
                        Make default
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editing === null && (
            <Button onClick={startAdd} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Add billing account
            </Button>
          )}
        </div>

        {/* Add / edit form */}
        {editing !== null && (
          <div className="space-y-4 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {editing === 'new' ? 'Add billing account' : 'Edit billing account'}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ba-name">Account name</Label>
                <Input
                  id="ba-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Acme Ltd — North Region"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-sage">Sage A/C ref</Label>
                <Input
                  id="ba-sage"
                  value={form.sage_account_ref ?? ''}
                  onChange={(e) => set('sage_account_ref', e.target.value)}
                  placeholder="e.g. ACME001"
                  maxLength={8}
                  className="font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ba-address">Invoice address</Label>
              <Textarea
                id="ba-address"
                value={form.invoice_address ?? ''}
                onChange={(e) => set('invoice_address', e.target.value)}
                placeholder="Billing address (if different from the site)"
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ba-postcode">Invoice postcode</Label>
                <Input
                  id="ba-postcode"
                  value={form.invoice_postcode ?? ''}
                  onChange={(e) => set('invoice_postcode', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-contact">Invoice contact</Label>
                <Input
                  id="ba-contact"
                  value={form.invoice_contact_name ?? ''}
                  onChange={(e) => set('invoice_contact_name', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-email">Invoice email</Label>
                <Input
                  id="ba-email"
                  type="email"
                  value={form.invoice_email ?? ''}
                  onChange={(e) => set('invoice_email', e.target.value)}
                  inputMode="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-phone">Invoice phone</Label>
                <Input
                  id="ba-phone"
                  value={form.invoice_phone ?? ''}
                  onChange={(e) => set('invoice_phone', e.target.value)}
                  inputMode="tel"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="ba-terms">Payment terms (days)</Label>
                <Input
                  id="ba-terms"
                  type="number"
                  min={0}
                  value={form.payment_terms_days ?? 30}
                  onChange={(e) => set('payment_terms_days', Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-tax">Tax code</Label>
                <Input
                  id="ba-tax"
                  value={form.default_tax_code ?? 'T1'}
                  onChange={(e) => set('default_tax_code', e.target.value)}
                  placeholder="T1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-nominal">Nominal code</Label>
                <Input
                  id="ba-nominal"
                  value={form.default_nominal_code ?? '4000'}
                  onChange={(e) => set('default_nominal_code', e.target.value)}
                  placeholder="4000"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ba-rate-card">
                Rate card <span className="text-muted-foreground">(labour pricing)</span>
              </Label>
              <Select
                value={form.rate_card_id ?? INHERIT_DEFAULT}
                onValueChange={(v) => set('rate_card_id', v === INHERIT_DEFAULT ? null : v)}
              >
                <SelectTrigger id="ba-rate-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT_DEFAULT}>
                    Company default
                    {rateCards.find((c) => c.is_default)
                      ? ` (${rateCards.find((c) => c.is_default)!.name})`
                      : ''}
                  </SelectItem>
                  {rateCards
                    .filter((c) => !c.is_default)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used to auto-price call-out and labour lines on invoices for this account.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ba-frequency">Billing frequency</Label>
              <Select
                value={form.billing_frequency ?? 'on_demand'}
                onValueChange={(v) => set('billing_frequency', v as BillingFrequency)}
              >
                <SelectTrigger id="ba-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BILLING_FREQUENCY_LABELS) as BillingFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {BILLING_FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A cadence hint shown in the ready-to-invoice queue. It never blocks invoicing.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ba-notes">
                Notes <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="ba-notes"
                value={form.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
                rows={2}
              />
            </div>

            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing === 'new' ? 'Add account' : 'Save changes'}
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
