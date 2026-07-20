import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Receipt, ChevronRight } from 'lucide-react'
import { INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import { formatPence } from '@/lib/sales'
import { cn, formatDateUK } from '@/lib/utils'
import type { InvoiceStatus } from '@/lib/types/database'

export interface JobInvoiceRow {
  id: string
  invoice_number: string | null
  status: InvoiceStatus
  total_pence: number | null
  subtotal_pence: number | null
  issue_date: string | null
  created_at: string
  document_type: string | null
}

interface JobInvoicesCardProps {
  invoices: JobInvoiceRow[]
  /** Net contract value, for the invoiced-of-quoted summary. */
  quotedNetPence: number
  /** Net already invoiced (non-void). */
  invoicedNetPence: number
}

/**
 * Invoices raised against a job, each linking to the invoice detail page. Also
 * summarises how much of the contract value has been invoiced so far.
 */
export function JobInvoicesCard({
  invoices,
  quotedNetPence,
  invoicedNetPence,
}: JobInvoicesCardProps) {
  const remainingPence = Math.max(0, quotedNetPence - invoicedNetPence)
  const pct =
    quotedNetPence > 0 ? Math.min(100, Math.round((invoicedNetPence / quotedNetPence) * 100)) : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Invoices
        </CardTitle>
        {invoices.length > 0 && pct !== null ? (
          <span className="text-xs text-muted-foreground">{pct}% invoiced</span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices have been raised for this job yet. Use{' '}
            <span className="font-medium text-foreground">Raise invoice</span> above to bill works,
            equipment or claims.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {inv.invoice_number ?? 'Draft invoice'}
                        </span>
                        {inv.document_type === 'credit_note' ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            Credit
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateUK(inv.issue_date ?? inv.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-sm tabular-nums text-foreground">
                        {formatPence(inv.total_pence ?? 0)}
                      </span>
                      <StatusBadge
                        label={INVOICE_STATUS_LABELS[inv.status]}
                        status={inv.status}
                      />
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Invoiced (net)</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {formatPence(invoicedNetPence)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Remaining to invoice</dt>
                <dd
                  className={cn(
                    'font-mono tabular-nums',
                    remainingPence > 0 ? 'text-foreground' : 'text-chart-4',
                  )}
                >
                  {formatPence(remainingPence)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}
