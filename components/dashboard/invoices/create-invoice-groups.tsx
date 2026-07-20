'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Loader2, ReceiptText, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'
import { formatPence, BILLING_FREQUENCY_LABELS } from '@/lib/billing/invoices'
import {
  createInvoiceFromTasks,
  getInvoiceForActions,
  previewInvoiceFromTasks,
  type InvoicePreview,
  type ReadyGroup,
} from '@/lib/actions/invoices'
import { InvoiceQuickActions } from '@/components/dashboard/invoices/invoice-quick-actions'
import type { Invoice } from '@/lib/types/database'

export function CreateInvoiceGroups({
  groups,
  canEdit,
}: {
  groups: ReadyGroup[]
  canEdit: boolean
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium">Nothing waiting to be invoiced</p>
        <p className="text-sm text-muted-foreground">
          Reviewed chargeable calls will appear here, grouped by billing account.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <GroupCard
          key={group.accountId ?? `unassigned-${group.clientName}`}
          group={group}
          canEdit={canEdit}
        />
      ))}
    </div>
  )
}

function GroupCard({ group, canEdit }: { group: ReadyGroup; canEdit: boolean }) {
  const router = useRouter()
  const individual = group.invoiceCallsIndividually
  const [selected, setSelected] = useState<Set<string>>(() =>
    // When the client is invoiced per-call, start with nothing bulk-selected.
    individual ? new Set() : new Set(group.tasks.map((t) => t.id)),
  )
  // Key of the action currently loading a preview: 'bulk' or a single task id.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // The computed (not-yet-saved) preview + the calls it covers, shown in a
  // dialog so the user reviews the exact lines before the draft is raised.
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [previewIds, setPreviewIds] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  // Draft(s) just created from this group, shown inline with quick-actions
  // (Preview / Edit / Send) so the user can review without a page redirect.
  const [createdInvoices, setCreatedInvoices] = useState<Invoice[]>([])

  const allSelected = selected.size === group.tasks.length
  const noneSelected = selected.size === 0

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(group.tasks.map((t) => t.id)))
  }

  const selectedTotal = group.tasks
    .filter((t) => selected.has(t.id))
    .reduce((s, t) => s + t.partsTotalPence, 0)

  const canCreate = !!group.accountId && !group.onHold && !noneSelected
  const canAct = !!group.accountId && !group.onHold
  const busy = busyKey !== null || creating

  // Show the freshly created draft inline (with Preview / Edit / Send) rather
  // than redirecting away, so the user stays in the raise-invoice flow.
  const showCreated = async (invoiceId: string | undefined) => {
    if (!invoiceId) {
      router.refresh()
      return
    }
    const { invoice } = await getInvoiceForActions(invoiceId)
    if (invoice) setCreatedInvoices((prev) => [invoice, ...prev])
    router.refresh()
  }

  // Compute the invoice preview for a set of calls, then open the review dialog.
  const openPreview = async (ids: string[], key: string) => {
    if (!group.accountId || ids.length === 0) return
    setBusyKey(key)
    const res = await previewInvoiceFromTasks(group.accountId, ids)
    setBusyKey(null)
    if (res.error || !res.preview) {
      toast.error(res.error ?? 'Could not build a preview')
      return
    }
    setPreview(res.preview)
    setPreviewIds(ids)
    setPreviewOpen(true)
  }

  // Commit the previewed calls as a draft invoice.
  const confirmCreate = async () => {
    if (!group.accountId || previewIds.length === 0) return
    setCreating(true)
    const res = await createInvoiceFromTasks(group.accountId, previewIds)
    setCreating(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Draft invoice created')
    setPreviewOpen(false)
    await showCreated(res.invoiceId)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4" />
              {group.accountName}
            </CardTitle>
            {group.clientName && (
              <p className="mt-0.5 text-sm text-muted-foreground">{group.clientName}</p>
            )}
            {group.dueHint && (
              <Badge
                variant="outline"
                className={
                  group.dueHint.due
                    ? 'mt-1.5 border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'mt-1.5 text-muted-foreground'
                }
              >
                {BILLING_FREQUENCY_LABELS[group.billingFrequency]} · {group.dueHint.label}
              </Badge>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Parts total</p>
            <p className="font-semibold">{formatPence(selectedTotal)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!group.accountId && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No billing account</AlertTitle>
            <AlertDescription>
              These calls have no billing account set on their service, site, or client.
              Set one before they can be invoiced.
            </AlertDescription>
          </Alert>
        )}
        {group.onHold && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Account on hold</AlertTitle>
            <AlertDescription>
              {group.accountName} is {group.accountStatus}. Reactivate the billing
              account before raising an invoice.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {!individual && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all calls"
                    />
                  </TableHead>
                )}
                <TableHead>Ref</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-center">Parts</TableHead>
                <TableHead className="text-right">Parts total</TableHead>
                <TableHead className="w-32 text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.tasks.map((t) => (
                <TableRow key={t.id}>
                  {!individual && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={() => toggle(t.id)}
                        aria-label={`Select call ${t.reference}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{t.reference}</TableCell>
                  <TableCell>{t.siteName}</TableCell>
                  <TableCell className="text-muted-foreground">{t.serviceName}</TableCell>
                  <TableCell className="text-center">
                    {t.parts.length > 0 ? (
                      <Badge variant="secondary">{t.parts.length}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.partsTotalPence > 0 ? formatPence(t.partsTotalPence) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPreview([t.id], t.id)}
                      disabled={!canAct || busy}
                    >
                      {busyKey === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Preview'
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {individual ? (
            <p className="text-sm text-muted-foreground">
              This client is invoiced per call — preview and raise each call individually
              using the buttons above.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {selected.size} of {group.tasks.length} call
                {group.tasks.length === 1 ? '' : 's'} selected. Each call adds a labour
                line to price up.
              </p>
              <Button
                onClick={() => openPreview(Array.from(selected), 'bulk')}
                disabled={!canCreate || busy}
              >
                {busyKey === 'bulk' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Preview &amp; create
              </Button>
            </>
          )}
        </div>

        {createdInvoices.length > 0 && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Draft{createdInvoices.length === 1 ? '' : 's'} created
            </p>
            {createdInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <Link
                  href={`/dashboard/invoices/${inv.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {inv.invoice_number}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {formatPence(inv.total_pence)}
                  </span>
                  <InvoiceQuickActions invoice={inv} canEdit={canEdit} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        accountName={group.accountName}
        callCount={previewIds.length}
        preview={preview}
        creating={creating}
        onConfirm={confirmCreate}
      />
    </Card>
  )
}

function PreviewDialog({
  open,
  onOpenChange,
  accountName,
  callCount,
  preview,
  creating,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  accountName: string
  callCount: number
  preview: InvoicePreview | null
  creating: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-[320px] w-[92vw] min-w-[420px] max-w-[1100px] resize flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>Invoice preview</DialogTitle>
          <DialogDescription>
            Review the auto-priced lines for {accountName} before raising the draft. Nothing
            is saved until you create it — all lines stay editable afterwards.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <p className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
          </p>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Bill-to header block. */}
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Bill to</p>
                <p className="font-medium">{preview.billToName}</p>
                {preview.billToAddress && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {preview.billToAddress}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {preview.billToEmail || (
                    <span className="text-destructive">No invoice email set</span>
                  )}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-medium uppercase text-muted-foreground">Details</p>
                <p className="text-sm">
                  {callCount} call{callCount === 1 ? '' : 's'}
                </p>
                {preview.poNumber && (
                  <p className="text-sm text-muted-foreground">PO {preview.poNumber}</p>
                )}
                <p className="text-sm text-muted-foreground">VAT {preview.taxRate}%</p>
              </div>
            </div>

            {/* Line items exactly as they will be created. */}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-16 text-center">Qty</TableHead>
                    <TableHead className="w-24 text-right">Unit</TableHead>
                    <TableHead className="w-24 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No line items would be created.
                      </TableCell>
                    </TableRow>
                  ) : (
                    preview.lines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-normal break-words text-sm">
                        {l.description}
                      </TableCell>
                        <TableCell className="text-center tabular-nums">{l.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPence(l.unitPricePence)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatPence(l.amountPence)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals. */}
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatPence(preview.subtotalPence)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({preview.taxRate}%)</span>
                <span className="tabular-nums">{formatPence(preview.taxPence)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPence(preview.totalPence)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!preview || creating}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="mr-2 h-4 w-4" />
            )}
            Create draft invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
