'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, ReceiptText, ExternalLink } from 'lucide-react'
import type { Client, InvoiceStatus } from '@/lib/types/database'
import { formatPence, INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import { cn } from '@/lib/utils'

interface ClientInvoicesDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ClientInvoiceRow {
  id: string
  invoice_number: string
  status: InvoiceStatus
  document_type: 'invoice' | 'credit_note' | null
  total_pence: number
  issue_date: string | null
  created_at: string
  billing_account: { name: string } | null
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

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function ClientInvoicesDialog({ client, open, onOpenChange }: ClientInvoicesDialogProps) {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<ClientInvoiceRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, status, document_type, total_pence, issue_date, created_at, billing_account:billing_accounts(name)',
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setInvoices((data ?? []) as unknown as ClientInvoiceRow[])
    setLoading(false)
  }, [supabase, client.id])

  useEffect(() => {
    if (open) loadInvoices()
  }, [open, loadInvoices])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invoices — {client.name}</DialogTitle>
          <DialogDescription>
            All invoices and credit notes raised against this client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ReceiptText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No invoices have been raised for this client yet.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/invoices/${inv.id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {inv.invoice_number}
                    {inv.document_type === 'credit_note' && (
                      <Badge variant="secondary" className="text-[10px]">
                        Credit note
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.billing_account?.name || 'No billing account'} ·{' '}
                    {formatDate(inv.issue_date || inv.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPence(inv.total_pence)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('font-medium', statusClasses(inv.status))}
                  >
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </Badge>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
