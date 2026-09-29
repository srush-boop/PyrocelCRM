'use client'

import { useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseInvoice } from '@/lib/types/database'
import {
  updatePurchaseInvoiceAllocation,
  assignPurchaseInvoiceAuthoriser,
  lookupCallOrJobAllocation,
} from '@/lib/actions/purchase-invoices'

export interface EditorOptions {
  sites: { id: string; name: string; postcode: string | null }[]
  clients: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  branches: { id: string; name: string }[]
  nominalCodes: { id: string; code: string; name: string }[]
  departments: { id: string; name: string }[]
  authorisers: { id: string; full_name: string | null }[]
  tasks: { id: string; reference_number: string | null }[]
  jobs: { id: string; job_number: string | null; title: string | null }[]
}

const NONE = '__none__'

export function PurchaseInvoiceEditor({
  invoice,
  options,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: PurchaseInvoice
  options: EditorOptions
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [siteId, setSiteId] = useState(invoice.site_id ?? '')
  const [clientId, setClientId] = useState(invoice.client_id ?? '')
  const [branchId, setBranchId] = useState(invoice.branch_id ?? '')
  const [taskId, setTaskId] = useState<string | null>(invoice.task_id)
  const [jobId, setJobId] = useState<string | null>(invoice.job_id)
  const [supplierId, setSupplierId] = useState(invoice.supplier_id ?? '')
  const [supplierRef, setSupplierRef] = useState(invoice.supplier_ref ?? '')
  const [nominalId, setNominalId] = useState(invoice.nominal_code_id ?? '')
  const [departmentId, setDepartmentId] = useState(invoice.department_id ?? '')
  const [departmentCode, setDepartmentCode] = useState(invoice.department_code ?? '')
  const [amount, setAmount] = useState(
    invoice.amount_pence != null ? (invoice.amount_pence / 100).toString() : '',
  )
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date ?? '')
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [isPrepayment, setIsPrepayment] = useState(invoice.is_prepayment)
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [authoriserId, setAuthoriserId] = useState(invoice.authoriser_id ?? '')

  const [refKind, setRefKind] = useState<'task' | 'job'>(invoice.job_id ? 'job' : 'task')
  const [refPickerOpen, setRefPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [autofilling, setAutofilling] = useState(false)

  const refLabel = (() => {
    if (taskId) {
      const t = options.tasks.find((x) => x.id === taskId)
      return t?.reference_number ?? 'Selected call'
    }
    if (jobId) {
      const j = options.jobs.find((x) => x.id === jobId)
      return j?.job_number || j?.title || 'Selected job'
    }
    return null
  })()

  async function handlePickReference(kind: 'task' | 'job', id: string) {
    setRefPickerOpen(false)
    if (kind === 'task') {
      setTaskId(id)
      setJobId(null)
    } else {
      setJobId(id)
      setTaskId(null)
    }
    // Auto-fill site/client/branch from the chosen reference.
    setAutofilling(true)
    const res = await lookupCallOrJobAllocation(kind, id)
    setAutofilling(false)
    if (res.ok && res.allocation) {
      const a = res.allocation
      if (a.site_id) setSiteId(a.site_id)
      if (a.client_id) setClientId(a.client_id)
      if (a.branch_id) setBranchId(a.branch_id)
      if (kind === 'task' && a.job_id) setJobId(a.job_id)
    }
  }

  function clearReference() {
    setTaskId(null)
    setJobId(null)
  }

  function handleSave() {
    setError(null)
    const parsedAmount = amount.trim() === '' ? null : Math.round(Number(amount) * 100)
    if (parsedAmount != null && (Number.isNaN(parsedAmount) || parsedAmount < 0)) {
      setError('Enter a valid amount.')
      return
    }
    startTransition(async () => {
      const alloc = await updatePurchaseInvoiceAllocation(invoice.id, {
        site_id: siteId || null,
        client_id: clientId || null,
        task_id: taskId,
        job_id: jobId,
        branch_id: branchId || null,
        nominal_code_id: nominalId || null,
        department_id: departmentId || null,
        department_code: departmentCode.trim() || null,
        supplier_id: supplierId || null,
        supplier_ref: supplierRef.trim() || null,
        notes: notes.trim() || null,
        is_prepayment: isPrepayment,
        amount_pence: parsedAmount,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
      })
      if (!alloc.ok) {
        setError(alloc.error ?? 'Failed to save.')
        return
      }
      // If an authoriser is chosen (and changed), assign + notify them.
      if (authoriserId && authoriserId !== invoice.authoriser_id) {
        const assigned = await assignPurchaseInvoiceAuthoriser(invoice.id, authoriserId)
        if (!assigned.ok) {
          setError(assigned.error ?? 'Saved, but could not assign the authoriser.')
          return
        }
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-10">
          <SheetTitle>Allocate invoice</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="truncate">{invoice.name}</span>
            <a
              href={`/api/purchase-invoices/file?id=${invoice.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Reference picker — drives site/client/branch auto-fill */}
          <div className="space-y-2 rounded-md border p-3">
            <Label>Call / job reference</Label>
            <div className="flex items-center gap-2">
              <Select value={refKind} onValueChange={(v) => setRefKind(v as 'task' | 'job')}>
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Call</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                </SelectContent>
              </Select>
              <Popover open={refPickerOpen} onOpenChange={setRefPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="flex-1 justify-between font-normal"
                  >
                    <span className="truncate">
                      {refLabel ?? `Select a ${refKind === 'task' ? 'call' : 'job'}…`}
                    </span>
                    {autofilling ? (
                      <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={`Search ${refKind === 'task' ? 'calls' : 'jobs'}…`}
                    />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {refKind === 'task'
                          ? options.tasks
                              .filter((t) => t.reference_number)
                              .map((t) => (
                                <CommandItem
                                  key={t.id}
                                  value={t.reference_number ?? t.id}
                                  onSelect={() => handlePickReference('task', t.id)}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      taskId === t.id ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  {t.reference_number}
                                </CommandItem>
                              ))
                          : options.jobs.map((j) => (
                              <CommandItem
                                key={j.id}
                                value={`${j.job_number ?? ''} ${j.title ?? ''} ${j.id}`}
                                onSelect={() => handlePickReference('job', j.id)}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    jobId === j.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <span className="truncate">
                                  {j.job_number ? `${j.job_number} — ` : ''}
                                  {j.title ?? 'Untitled job'}
                                </span>
                              </CommandItem>
                            ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {refLabel && (
                <Button variant="ghost" size="sm" onClick={clearReference}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Selecting a call or job auto-fills the site, client and branch below.
            </p>
          </div>

          {/* Supplier + reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <SmartSelect
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Select supplier"
                options={options.suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier ref</Label>
              <Input
                value={supplierRef}
                onChange={(e) => setSupplierRef(e.target.value)}
                placeholder="Their invoice no."
              />
            </div>
          </div>

          {/* Site / client / branch */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Site</Label>
              <SmartSelect
                value={siteId}
                onChange={setSiteId}
                placeholder="Select site"
                options={options.sites.map((s) => ({ value: s.id, label: s.name, hint: s.postcode }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <SmartSelect
                value={clientId}
                onChange={setClientId}
                placeholder="Select client"
                options={options.clients.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Branch</Label>
              <SmartSelect
                value={branchId}
                onChange={setBranchId}
                placeholder="Select branch"
                options={options.branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <SmartSelect
                value={departmentId}
                onChange={setDepartmentId}
                placeholder="Select department"
                options={options.departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nominal code</Label>
              <SmartSelect
                value={nominalId}
                onChange={setNominalId}
                placeholder="Select nominal code"
                options={options.nominalCodes.map((n) => ({ value: n.id, label: `${n.code} — ${n.name}` }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pi-department-code">Department code (Sage)</Label>
              <Input
                id="pi-department-code"
                value={departmentCode}
                onChange={(e) => setDepartmentCode(e.target.value)}
                placeholder="e.g. 3"
                maxLength={20}
              />
            </div>
          </div>

          {/* Money + dates */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Amount (£)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">Pre-payment</Label>
              <p className="text-xs text-muted-foreground">Payment made / due in advance.</p>
            </div>
            <Switch checked={isPrepayment} onCheckedChange={setIsPrepayment} />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for the authoriser…"
              rows={3}
            />
          </div>

          {/* Authoriser */}
          <div className="space-y-2 rounded-md border p-3">
            <Label>Assign authoriser</Label>
            <SmartSelect
                value={authoriserId}
                onChange={setAuthoriserId}
                placeholder="Select authoriser"
                options={options.authorisers.map((a) => ({ value: a.id, label: a.full_name ?? 'Unnamed' }))}
              />
            <p className="text-xs text-muted-foreground">
              They&apos;ll be notified to approve the invoice for payment. Requires a supplier and
              amount.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="mt-0 flex-row justify-end border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const SEARCH_THRESHOLD = 5

type SmartOption = { value: string; label: string; hint?: string | null }

function SmartSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: SmartOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)

  if (options.length <= SEARCH_THRESHOLD) {
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : 'None'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${options.length} options…`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ none"
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                None
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ''} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
