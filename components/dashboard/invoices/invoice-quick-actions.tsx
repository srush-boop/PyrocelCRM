'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Send,
  Trash2,
  Plus,
  Loader2,
} from 'lucide-react'
import {
  addInvoiceLine,
  updateInvoiceLine,
  deleteInvoiceLine,
  sendInvoiceToClient,
  getInvoiceLinesForEdit,
} from '@/lib/actions/invoices'
import type { Invoice, InvoiceLineItem, InvoiceLineKind } from '@/lib/types/database'

const money = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  invoice: Invoice
  /** Whether the current user holds the invoice-edit permission. */
  canEdit: boolean
  /** Compact icon-only trigger for dense table rows. */
  className?: string
}

// Shared per-invoice quick actions (Preview / Edit / Send) used on both the
// invoices list and the raise-invoice page. Preview is open to everyone; Edit
// and Send only render when `canEdit` and the invoice is still editable (not
// sent, not void/paid). Sending is the point that locks the invoice. Line items
// for the editor are lazy-loaded when the dialog opens, keeping the list light.
export function InvoiceQuickActions({ invoice, canEdit, className }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  const isSent = !!invoice.sent_at
  const isLocked = isSent || invoice.status === 'void' || invoice.status === 'paid'
  const isCreditNote = invoice.document_type === 'credit_note'
  const editable = canEdit && !isLocked && !isCreditNote

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className} aria-label="Invoice actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              Preview PDF
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/invoices/${invoice.id}`}>
              <Pencil className="mr-2 h-4 w-4" />
              Open detail
            </Link>
          </DropdownMenuItem>
          {editable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Quick edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSendOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Send to client
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editable && (
        <QuickEditDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />
      )}
      {editable && (
        <SendDialog open={sendOpen} onOpenChange={setSendOpen} invoice={invoice} />
      )}
    </>
  )
}

function QuickEditDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  invoice: Invoice
}) {
  const router = useRouter()
  const [lines, setLines] = useState<InvoiceLineItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    const res = await getInvoiceLinesForEdit(invoice.id)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setLines(res.lines)
    router.refresh()
  }

  // Load lines the first time the dialog opens.
  const handleOpenChange = (o: boolean) => {
    onOpenChange(o)
    if (o && lines === null) void reload()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            Adjust line items before sending. Changes save immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {loading && lines === null ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
            </p>
          ) : (lines?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No line items yet.</p>
          ) : (
            lines?.map((line) => (
              <QuickEditLine key={line.id} line={line} onChanged={reload} />
            ))
          )}
        </div>

        <AddLineRow invoiceId={invoice.id} onAdded={reload} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickEditLine({ line, onChanged }: { line: InvoiceLineItem; onChanged: () => void }) {
  const [description, setDescription] = useState(line.description)
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [unitPounds, setUnitPounds] = useState((line.unit_price_pence / 100).toFixed(2))
  const [pending, startTransition] = useTransition()

  const save = () => {
    if (!description.trim()) {
      toast.error('Description is required')
      return
    }
    startTransition(async () => {
      const res = await updateInvoiceLine(line.id, line.invoice_id, {
        description: description.trim(),
        quantity: Number(quantity) || 0,
        unitPricePence: Math.round((Number(unitPounds) || 0) * 100),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Line updated')
      onChanged()
    })
  }

  const remove = () => {
    startTransition(async () => {
      const res = await deleteInvoiceLine(line.id, line.invoice_id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Line removed')
      onChanged()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <div className="min-w-[10rem] flex-1">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} />
      </div>
      <div className="w-16">
        <Label className="text-xs text-muted-foreground">Qty</Label>
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} onBlur={save} inputMode="decimal" />
      </div>
      <div className="w-24">
        <Label className="text-xs text-muted-foreground">Unit £</Label>
        <Input value={unitPounds} onChange={(e) => setUnitPounds(e.target.value)} onBlur={save} inputMode="decimal" />
      </div>
      <div className="w-24 text-right">
        <span className="text-xs text-muted-foreground">Amount</span>
        <p className="font-medium tabular-nums">{money(line.amount_pence)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label="Remove line"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      </Button>
    </div>
  )
}

function AddLineRow({ invoiceId, onAdded }: { invoiceId: string; onAdded: () => void }) {
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPounds, setUnitPounds] = useState('0.00')
  const [pending, startTransition] = useTransition()

  const add = () => {
    if (!description.trim()) {
      toast.error('Enter a description')
      return
    }
    startTransition(async () => {
      const res = await addInvoiceLine(invoiceId, {
        kind: 'other' as InvoiceLineKind,
        description: description.trim(),
        quantity: Number(quantity) || 0,
        unitPricePence: Math.round((Number(unitPounds) || 0) * 100),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Line added')
      setDescription('')
      setQuantity('1')
      setUnitPounds('0.00')
      onAdded()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
      <div className="min-w-[10rem] flex-1">
        <Label className="text-xs text-muted-foreground">New line description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Additional works" />
      </div>
      <div className="w-16">
        <Label className="text-xs text-muted-foreground">Qty</Label>
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
      </div>
      <div className="w-24">
        <Label className="text-xs text-muted-foreground">Unit £</Label>
        <Input value={unitPounds} onChange={(e) => setUnitPounds(e.target.value)} inputMode="decimal" />
      </div>
      <Button onClick={add} disabled={pending} className="gap-1">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </Button>
    </div>
  )
}

function SendDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  invoice: Invoice
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const toEmail = invoice.bill_to_email?.trim()

  const send = () => {
    startTransition(async () => {
      const res = await sendInvoiceToClient(invoice.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Invoice sent to client')
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send {invoice.invoice_number} to client?</AlertDialogTitle>
          <AlertDialogDescription>
            {toEmail ? (
              <>
                The invoice PDF will be emailed to <strong>{toEmail}</strong>. Once sent, the
                invoice is locked and can no longer be edited.
              </>
            ) : (
              <>
                No invoice email is set for this billing account. Add an invoice email on the
                billing account before sending.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              send()
            }}
            disabled={pending || !toEmail}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
