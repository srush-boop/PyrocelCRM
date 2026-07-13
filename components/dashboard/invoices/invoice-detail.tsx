'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Ban,
  PauseCircle,
  PlayCircle,
  ReceiptText,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceLineKind,
  InvoiceStatus,
  NominalCode,
} from '@/lib/types/database'
import { formatPence, financialYearLabel, INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import {
  addInvoiceLine,
  deleteInvoiceLine,
  issueInvoice,
  markInvoicePaid,
  setInvoiceLineNominal,
  updateInvoiceLine,
  updateInvoiceMeta,
  voidInvoice,
} from '@/lib/actions/invoices'
import { raiseCreditNote, holdInvoice, releaseInvoice } from '@/lib/actions/invoice-extras'

type InvoiceWithNames = Invoice & {
  billing_account: { name: string } | null
  client: { name: string } | null
}

function statusClasses(status: InvoiceStatus): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'issued':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'void':
      return 'bg-muted text-muted-foreground'
    default:
      return 'bg-amber-100 text-amber-800 border-amber-200'
  }
}

const KIND_LABELS: Record<InvoiceLineKind, string> = {
  labour: 'Labour',
  part: 'Part',
  other: 'Other',
  job_claim: 'Works to date',
  equipment: 'Equipment',
  job_line: 'Job line',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function InvoiceDetail({
  invoice,
  lines,
  serviceTypeByLineId = {},
  nominalCodes = [],
}: {
  invoice: InvoiceWithNames
  lines: InvoiceLineItem[]
  serviceTypeByLineId?: Record<string, string>
  nominalCodes?: NominalCode[]
}) {
  const router = useRouter()
  const isDraft = invoice.status === 'draft'
  const isCreditNote = invoice.document_type === 'credit_note'
  const [busy, setBusy] = useState(false)
  // Lines still missing an internal nominal code — blocks issuing.
  const missingNominal = lines.filter((l) => !l.nominal_code_id).length

  // Group-by-service-type (presentation only): only when read-only (issued/
  // paid/void) AND the invoice spans two or more service types. Lines with no
  // resolved service type fall under "Other charges".
  const OTHER = 'Other charges'
  const groupedByService = (() => {
    if (isDraft) return null
    const groups = new Map<string, InvoiceLineItem[]>()
    for (const line of lines) {
      const key = serviceTypeByLineId[line.id] ?? OTHER
      const arr = groups.get(key) ?? []
      arr.push(line)
      groups.set(key, arr)
    }
    const realServiceCount = Array.from(groups.keys()).filter((k) => k !== OTHER).length
    if (realServiceCount < 2) return null
    // Deterministic order: named service types alphabetically, "Other" last.
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === OTHER) return 1
      if (b === OTHER) return -1
      return a.localeCompare(b)
    })
  })()

  const run = async (
    fn: () => Promise<{ error?: string | null }>,
    success: string,
  ) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(success)
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main column */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {isCreditNote && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Credit note
                  </p>
                )}
                <CardTitle className="text-2xl">{invoice.invoice_number}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  FY {financialYearLabel(invoice.financial_year)}
                </p>
                {isCreditNote && invoice.credited_invoice_id && (
                  <p className="mt-1 text-sm">
                    <Link
                      href={`/dashboard/invoices/${invoice.credited_invoice_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      View original invoice
                    </Link>
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge
                  variant="outline"
                  className={cn('text-sm font-medium', statusClasses(invoice.status))}
                >
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </Badge>
                {invoice.on_hold && (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-100 text-amber-800"
                  >
                    On hold
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</p>
              <p className="font-medium">
                {invoice.billing_account?.name || invoice.bill_to_name || '—'}
              </p>
              {invoice.bill_to_address && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {invoice.bill_to_address}
                </p>
              )}
              {invoice.bill_to_email && (
                <p className="text-sm text-muted-foreground">{invoice.bill_to_email}</p>
              )}
              {invoice.sage_account_ref && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sage A/C: {invoice.sage_account_ref}
                </p>
              )}
              {(invoice.po_number || invoice.site_address) && (
                <div className="mt-3 space-y-1">
                  {invoice.po_number && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">PO number: </span>
                      <span className="font-medium">{invoice.po_number}</span>
                    </p>
                  )}
                  {invoice.site_address && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Site: </span>
                      <span className="whitespace-pre-line">{invoice.site_address}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:block sm:space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Issued</span>
                <span>{formatDate(invoice.issue_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Due</span>
                <span>{formatDate(invoice.due_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Terms</span>
                <span>{invoice.payment_terms_days} days</span>
              </div>
              {invoice.status === 'paid' && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Paid</span>
                  <span>{formatDate(invoice.paid_at)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Line items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-44">Nominal</TableHead>
                    <TableHead className="w-20 text-right">Qty</TableHead>
                    <TableHead className="w-28 text-right">Unit (£)</TableHead>
                    <TableHead className="w-28 text-right">Amount</TableHead>
                    {isDraft && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isDraft ? 7 : 6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No line items yet.
                      </TableCell>
                    </TableRow>
                  ) : groupedByService ? (
                    groupedByService.map(([serviceName, groupLines]) => {
                      const subtotal = groupLines.reduce((s, l) => s + l.amount_pence, 0)
                      return (
                        <Fragment key={serviceName}>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={5} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {serviceName}
                            </TableCell>
                            <TableCell className="py-2 text-right text-xs font-medium text-muted-foreground">
                              {formatPence(subtotal)}
                            </TableCell>
                          </TableRow>
                          {groupLines.map((line) => (
                            <ReadOnlyLineRow key={line.id} line={line} />
                          ))}
                        </Fragment>
                      )
                    })
                  ) : (
                    lines.map((line) =>
                      isDraft ? (
                        <EditableLineRow
                          key={line.id}
                          line={line}
                          nominalCodes={nominalCodes}
                          onSaved={() => router.refresh()}
                        />
                      ) : (
                        <ReadOnlyLineRow key={line.id} line={line} />
                      ),
                    )
                  )}
                </TableBody>
              </Table>
            </div>

            {isDraft && (
              <p className="text-xs text-muted-foreground">
                Call-out and labour lines are auto-priced from the account&apos;s rate card. Adjust
                the labour <span className="font-medium">Qty</span> (hours) to account for travel
                time or on-site adjustments before issuing.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Nominal</span> codes are internal accounting references
              (for Sage) and never appear on the copy sent to the customer.
              {isDraft && missingNominal > 0 && (
                <span className="ml-1 font-medium text-amber-700">
                  {missingNominal} line{missingNominal === 1 ? '' : 's'} still need a code before you
                  can issue.
                </span>
              )}
            </p>

            {isDraft && <AddLineForm invoiceId={invoice.id} onAdded={() => router.refresh()} />}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar: totals + actions */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPence(invoice.subtotal_pence)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT ({invoice.tax_rate}%)</span>
              <span>{formatPence(invoice.tax_pence)}</span>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span>{formatPence(invoice.total_pence)}</span>
            </div>

            {isDraft && (
              <TaxRateAndNotes
                invoiceId={invoice.id}
                taxRate={invoice.tax_rate}
                notes={invoice.notes}
                poNumber={invoice.po_number}
                siteAddress={invoice.site_address}
              />
            )}
            {!isDraft && invoice.notes && (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="whitespace-pre-line text-sm">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Customer-facing PDF (no internal nominal codes). Drafts open a
                watermarked preview. */}
            <Button asChild variant="outline" className="w-full">
              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="mr-2 h-4 w-4" />
                {isDraft ? 'Preview PDF' : `View ${isCreditNote ? 'credit note' : 'invoice'} PDF`}
              </a>
            </Button>
            {isDraft && (
              <ConfirmButton
                trigger={
                  <Button
                    className="w-full"
                    disabled={busy || lines.length === 0 || invoice.on_hold || missingNominal > 0}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {isCreditNote ? 'Issue credit note' : 'Issue invoice'}
                  </Button>
                }
                title={isCreditNote ? 'Issue this credit note?' : 'Issue this invoice?'}
                description="Issuing sets the dates and locks the line items. This cannot be undone (you can void it instead)."
                actionLabel="Issue"
                onConfirm={() => run(() => issueInvoice(invoice.id), 'Issued')}
              />
            )}
            {isDraft && invoice.on_hold && (
              <p className="text-xs text-amber-700">
                On hold{invoice.hold_reason ? `: ${invoice.hold_reason}` : ''} — release to issue.
              </p>
            )}
            {/* Hold / release (draft only) */}
            {isDraft && !invoice.on_hold && (
              <HoldButton
                disabled={busy}
                onConfirm={(reason) => run(() => holdInvoice(invoice.id, reason), 'Invoice held')}
              />
            )}
            {isDraft && invoice.on_hold && (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => run(() => releaseInvoice(invoice.id), 'Invoice released')}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Release hold
              </Button>
            )}
            {invoice.status === 'issued' && !isCreditNote && (
              <ConfirmButton
                trigger={
                  <Button className="w-full" disabled={busy}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark as paid
                  </Button>
                }
                title="Mark invoice as paid?"
                description="Record that this invoice has been paid in full."
                actionLabel="Mark paid"
                onConfirm={() => run(() => markInvoicePaid(invoice.id), 'Invoice marked paid')}
              />
            )}
            {/* Raise a credit note against an issued/paid invoice. */}
            {!isCreditNote && (invoice.status === 'issued' || invoice.status === 'paid') && (
              <ConfirmButton
                trigger={
                  <Button variant="outline" className="w-full" disabled={busy}>
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Raise credit note
                  </Button>
                }
                title="Raise a credit note?"
                description="Creates a draft credit note copying this invoice's lines. You can trim it to a partial credit before issuing."
                actionLabel="Create"
                onConfirm={async () => {
                  setBusy(true)
                  const res = await raiseCreditNote(invoice.id)
                  setBusy(false)
                  if (res.error) {
                    toast.error(res.error)
                    return
                  }
                  toast.success('Credit note created')
                  if (res.id) router.push(`/dashboard/invoices/${res.id}`)
                }}
              />
            )}
            {(invoice.status === 'draft' || invoice.status === 'issued') && (
              <VoidButton
                disabled={busy}
                onConfirm={(reason) => run(() => voidInvoice(invoice.id, reason), 'Invoice voided')}
              />
            )}
            {invoice.status === 'void' && (
              <p className="text-sm text-muted-foreground">
                This invoice was voided{invoice.void_reason ? `: ${invoice.void_reason}` : '.'}
              </p>
            )}
            {invoice.status === 'paid' && (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Paid in full.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---- Editable line row (draft only) ------------------------------------
function EditableLineRow({
  line,
  nominalCodes,
  onSaved,
}: {
  line: InvoiceLineItem
  nominalCodes: NominalCode[]
  onSaved: () => void
}) {
  const [description, setDescription] = useState(line.description)
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [unitPounds, setUnitPounds] = useState((line.unit_price_pence / 100).toFixed(2))
  const [saving, setSaving] = useState(false)
  const [nominalId, setNominalId] = useState<string | null>(line.nominal_code_id)
  const [nominalSaving, setNominalSaving] = useState(false)

  const saveNominal = async (id: string | null) => {
    setNominalId(id)
    setNominalSaving(true)
    const res = await setInvoiceLineNominal(line.id, line.invoice_id, id)
    setNominalSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    onSaved()
  }

  const dirty =
    description !== line.description ||
    Number(quantity) !== line.quantity ||
    Math.round(Number(unitPounds) * 100) !== line.unit_price_pence

  const amountPence = Math.round((Number(quantity) || 0) * (Number(unitPounds) || 0) * 100)

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    const res = await updateInvoiceLine(line.id, line.invoice_id, {
      description,
      quantity: Number(quantity) || 0,
      unitPricePence: Math.round((Number(unitPounds) || 0) * 100),
    })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    onSaved()
  }

  const remove = async () => {
    setSaving(true)
    const res = await deleteInvoiceLine(line.id, line.invoice_id)
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Line removed')
    onSaved()
  }

  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary">{KIND_LABELS[line.kind]}</Badge>
      </TableCell>
      <TableCell>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={save}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <NominalCodeSelect
          value={nominalId}
          onChange={saveNominal}
          codes={nominalCodes}
          noneLabel="— none —"
          className={cn('h-8', !nominalId && 'border-amber-400 text-amber-700')}
          disabled={nominalSaving}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={save}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="decimal"
          value={unitPounds}
          onChange={(e) => setUnitPounds(e.target.value)}
          onBlur={save}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell className="text-right font-medium">
        {saving ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin" />
        ) : (
          formatPence(amountPence)
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={remove}
          disabled={saving}
          aria-label="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ---- Add line form ------------------------------------------------------
function AddLineForm({ invoiceId, onAdded }: { invoiceId: string; onAdded: () => void }) {
  const [kind, setKind] = useState<InvoiceLineKind>('labour')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPounds, setUnitPounds] = useState('0.00')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!description.trim()) {
      toast.error('Enter a description')
      return
    }
    setAdding(true)
    const res = await addInvoiceLine(invoiceId, {
      kind,
      description,
      quantity: Number(quantity) || 0,
      unitPricePence: Math.round((Number(unitPounds) || 0) * 100),
    })
    setAdding(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setDescription('')
    setQuantity('1')
    setUnitPounds('0.00')
    setKind('labour')
    onAdded()
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
      <div className="w-28">
        <Label className="text-xs">Type</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as InvoiceLineKind)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="labour">Labour</SelectItem>
            <SelectItem value="part">Part</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[12rem] flex-1">
        <Label className="text-xs">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Attendance / labour"
          className="h-8"
        />
      </div>
      <div className="w-20">
        <Label className="text-xs">Qty</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-right"
        />
      </div>
      <div className="w-24">
        <Label className="text-xs">Unit (£)</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={unitPounds}
          onChange={(e) => setUnitPounds(e.target.value)}
          className="h-8 text-right"
        />
      </div>
      <Button onClick={add} disabled={adding} size="sm" className="h-8">
        {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Add
      </Button>
    </div>
  )
}

// ---- Tax rate + notes (draft) ------------------------------------------
function TaxRateAndNotes({
  invoiceId,
  taxRate,
  notes,
  poNumber,
  siteAddress,
}: {
  invoiceId: string
  taxRate: number
  notes: string | null
  poNumber: string | null
  siteAddress: string | null
}) {
  const router = useRouter()
  const [rate, setRate] = useState(String(taxRate))
  const [note, setNote] = useState(notes ?? '')
  const [po, setPo] = useState(poNumber ?? '')
  const [site, setSite] = useState(siteAddress ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const res = await updateInvoiceMeta(invoiceId, {
      notes: note,
      taxRate: Number(rate) || 0,
      poNumber: po,
      siteAddress: site,
    })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <Label className="text-xs">PO number</Label>
        <Input
          value={po}
          onChange={(e) => setPo(e.target.value)}
          onBlur={save}
          placeholder="Customer purchase order"
          className="h-8"
        />
      </div>
      <div>
        <Label className="text-xs">Site address</Label>
        <Textarea
          value={site}
          onChange={(e) => setSite(e.target.value)}
          onBlur={save}
          placeholder="Site the work relates to"
          rows={2}
        />
      </div>
      <div>
        <Label className="text-xs">VAT rate (%)</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={save}
          className="h-8"
        />
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          placeholder="Optional notes shown on the invoice"
          rows={3}
        />
      </div>
      {saving && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  )
}

// ---- Confirm dialogs ----------------------------------------------------
function ConfirmButton({
  trigger,
  title,
  description,
  actionLabel,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReadOnlyLineRow({ line }: { line: InvoiceLineItem }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary">{KIND_LABELS[line.kind]}</Badge>
      </TableCell>
      <TableCell>{line.description}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {line.nominal_code || '—'}
      </TableCell>
      <TableCell className="text-right">{line.quantity}</TableCell>
      <TableCell className="text-right">{(line.unit_price_pence / 100).toFixed(2)}</TableCell>
      <TableCell className="text-right font-medium">{formatPence(line.amount_pence)}</TableCell>
    </TableRow>
  )
}

function HoldButton({
  disabled,
  onConfirm,
}: {
  disabled: boolean
  onConfirm: (reason: string | null) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full" disabled={disabled}>
          <PauseCircle className="mr-2 h-4 w-4" />
          Put on hold
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Put this draft on hold?</AlertDialogTitle>
          <AlertDialogDescription>
            The draft stays editable but cannot be issued until it is released.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(reason.trim() || null)}>
            Put on hold
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function VoidButton({
  disabled,
  onConfirm,
  }: {
  disabled: boolean
  onConfirm: (reason: string | null) => void
  }) {
  const [reason, setReason] = useState('')
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full text-destructive hover:text-destructive" disabled={disabled}>
          <Ban className="mr-2 h-4 w-4" />
          Void invoice
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
          <AlertDialogDescription>
            Voiding releases its calls back to the chargeable queue so they can be
            re-invoiced. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(reason.trim() || null)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Void
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
