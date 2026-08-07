'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FileText,
  Upload,
  MoreHorizontal,
  ExternalLink,
  Check,
  X,
  Loader2,
  CircleCheckBig,
  RotateCcw,
  Trash2,
  Pencil,
} from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import { cn } from '@/lib/utils'
import type { PurchaseInvoice, PurchaseInvoiceStatus, FormDocument } from '@/lib/types/database'
import { PurchaseInvoiceEditor, type EditorOptions } from './purchase-invoice-editor'
import { FormDocumentsSection } from './form-documents-section'
import {
  decidePurchaseInvoice,
  completePurchaseInvoice,
  reopenPurchaseInvoice,
  deletePurchaseInvoice,
} from '@/lib/actions/purchase-invoices'

const STATUS_META: Record<
  PurchaseInvoiceStatus,
  { label: string; className: string }
> = {
  awaiting_approval: {
    label: 'Awaiting approval',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  complete: { label: 'Complete', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function PurchaseInvoicesView({
  invoices,
  currentUserId,
  currentUserRole,
  options,
  formDocuments,
}: {
  invoices: PurchaseInvoice[]
  currentUserId: string
  currentUserRole: string
  options: EditorOptions
  formDocuments: FormDocument[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [prepayFilter, setPrepayFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<PurchaseInvoice | null>(null)
  const [decisionTarget, setDecisionTarget] = useState<{
    invoice: PurchaseInvoice
    decision: 'approved' | 'rejected'
  } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const isAdmin = currentUserRole === 'admin'

  const counts = useMemo(() => {
    const c = { awaiting: 0, mine: 0, approved: 0, rejected: 0, complete: 0 }
    for (const inv of invoices) {
      if (inv.status === 'awaiting_approval') {
        c.awaiting++
        if (inv.authoriser_id === currentUserId) c.mine++
      } else if (inv.status === 'approved') c.approved++
      else if (inv.status === 'rejected') c.rejected++
      else if (inv.status === 'complete') c.complete++
    }
    return c
  }, [invoices, currentUserId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (statusFilter === 'mine') {
        if (!(inv.status === 'awaiting_approval' && inv.authoriser_id === currentUserId))
          return false
      } else if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (supplierFilter !== 'all' && inv.supplier_id !== supplierFilter) return false
      if (branchFilter !== 'all' && inv.branch_id !== branchFilter) return false
      if (prepayFilter === 'yes' && !inv.is_prepayment) return false
      if (prepayFilter === 'no' && inv.is_prepayment) return false
      if (q) {
        const hay = [
          inv.name,
          inv.supplier_ref,
          inv.notes,
          inv.supplier?.name,
          inv.site?.name,
          inv.client?.name,
          inv.task?.reference_number,
          inv.job?.job_number,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [invoices, statusFilter, supplierFilter, branchFilter, prepayFilter, search, currentUserId])

  function handleUploadClick() {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('file', f))
      const res = await fetch('/api/purchase-invoices/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed.')
      } else {
        router.refresh()
      }
    } catch {
      setUploadError('Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn()
      if (res.ok) router.refresh()
      else alert(res.error ?? 'Action failed.')
    })
  }

  function submitDecision() {
    if (!decisionTarget) return
    const { invoice, decision } = decisionTarget
    startTransition(async () => {
      const res = await decidePurchaseInvoice(invoice.id, decision, decisionNotes)
      if (res.ok) {
        setDecisionTarget(null)
        setDecisionNotes('')
        router.refresh()
      } else {
        alert(res.error ?? 'Action failed.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Invoices</h1>
          <p className="text-muted-foreground">
            Store supplier invoices, allocate them, and approve them for payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            className="hidden"
            onChange={handleFilesChosen}
          />
          <Button onClick={handleUploadClick} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload invoices
          </Button>
        </div>
      </div>

      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

      {/* Quick stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Awaiting approval"
          value={counts.awaiting}
          active={statusFilter === 'awaiting_approval'}
          onClick={() => setStatusFilter('awaiting_approval')}
        />
        <StatTile
          label="Awaiting my approval"
          value={counts.mine}
          active={statusFilter === 'mine'}
          onClick={() => setStatusFilter('mine')}
        />
        <StatTile
          label="Approved"
          value={counts.approved}
          active={statusFilter === 'approved'}
          onClick={() => setStatusFilter('approved')}
        />
        <StatTile
          label="Complete"
          value={counts.complete}
          active={statusFilter === 'complete'}
          onClick={() => setStatusFilter('complete')}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
            <SelectItem value="mine">Awaiting my approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {options.suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {options.branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prepayFilter} onValueChange={setPrepayFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Pre-payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            <SelectItem value="yes">Pre-payment</SelectItem>
            <SelectItem value="no">Standard</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search name, ref, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Site / client</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Invoice / due</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Authoriser</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      No purchase invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((inv) => {
                    const canDecide =
                      inv.status === 'awaiting_approval' &&
                      (isAdmin || inv.authoriser_id === currentUserId)
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="max-w-48">
                          <a
                            href={`/api/purchase-invoices/file?id=${inv.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{inv.name}</span>
                          </a>
                          {inv.is_prepayment && (
                            <Badge variant="outline" className="ml-1 mt-1 text-xs">
                              Pre-payment
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{inv.supplier?.name ?? '—'}</div>
                          {inv.supplier_ref && (
                            <div className="text-xs text-muted-foreground">{inv.supplier_ref}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{inv.site?.name ?? '—'}</div>
                          {inv.client?.name && (
                            <div className="text-xs text-muted-foreground">{inv.client.name}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.task?.reference_number ??
                            inv.job?.job_number ??
                            inv.job?.title ??
                            '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.amount_pence != null ? formatPence(inv.amount_pence) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{fmtDate(inv.invoice_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            due {fmtDate(inv.due_date)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.nominal_code ? inv.nominal_code.code : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.authoriser?.full_name ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('font-medium', STATUS_META[inv.status].className)}
                          >
                            {STATUS_META[inv.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(inv)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit allocation
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a
                                  href={`/api/purchase-invoices/file?id=${inv.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  View file
                                </a>
                              </DropdownMenuItem>
                              {canDecide && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setDecisionTarget({ invoice: inv, decision: 'approved' })
                                    }
                                  >
                                    <Check className="mr-2 h-4 w-4" />
                                    Approve for payment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setDecisionTarget({ invoice: inv, decision: 'rejected' })
                                    }
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    Reject
                                  </DropdownMenuItem>
                                </>
                              )}
                              {inv.status === 'approved' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      runAction(() => completePurchaseInvoice(inv.id))
                                    }
                                  >
                                    <CircleCheckBig className="mr-2 h-4 w-4" />
                                    Mark complete
                                  </DropdownMenuItem>
                                </>
                              )}
                              {inv.status === 'complete' && (
                                <DropdownMenuItem
                                  onClick={() => runAction(() => reopenPurchaseInvoice(inv.id))}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Reopen
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (confirm('Delete this purchase invoice?'))
                                    runAction(() => deletePurchaseInvoice(inv.id))
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Separate section: expense/receipt documents submitted via Tasks & Forms. */}
      <FormDocumentsSection documents={formDocuments} />

      {editing && (
        <PurchaseInvoiceEditor
          invoice={editing}
          options={options}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}

      <Dialog
        open={!!decisionTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDecisionTarget(null)
            setDecisionNotes('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.decision === 'approved'
                ? 'Approve for payment'
                : 'Reject invoice'}
            </DialogTitle>
            <DialogDescription>{decisionTarget?.invoice.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notes {decisionTarget?.decision === 'rejected' ? '' : '(optional)'}</Label>
            <Textarea
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder={
                decisionTarget?.decision === 'approved'
                  ? 'Any note for the uploader…'
                  : 'Why is this being rejected?'
              }
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecisionTarget(null)
                setDecisionNotes('')
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant={decisionTarget?.decision === 'rejected' ? 'destructive' : 'default'}
              onClick={submitDecision}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decisionTarget?.decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 text-left transition-colors hover:bg-muted/50',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  )
}
