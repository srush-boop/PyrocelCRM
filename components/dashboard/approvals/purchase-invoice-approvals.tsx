'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Check, X, FileText, ExternalLink, Loader2 } from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import type { PurchaseInvoice } from '@/lib/types/database'
import { decidePurchaseInvoice } from '@/lib/actions/purchase-invoices'

export function PurchaseInvoiceApprovals({ invoices }: { invoices: PurchaseInvoice[] }) {
  const router = useRouter()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  if (invoices.length === 0) return null

  function decide(id: string, decision: 'approved' | 'rejected', note?: string) {
    startTransition(async () => {
      const res = await decidePurchaseInvoice(id, decision, note)
      if (res.ok) {
        setRejectingId(null)
        setNotes('')
        router.refresh()
      } else {
        alert(res.error ?? 'Action failed.')
      }
    })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Purchase invoices</h2>
      <div className="space-y-3">
        {invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0 space-y-1">
                <a
                  href={`/api/purchase-invoices/file?id=${inv.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{inv.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{inv.supplier?.name ?? 'No supplier'}</span>
                  {inv.supplier_ref && <span>Ref {inv.supplier_ref}</span>}
                  {inv.amount_pence != null && (
                    <span className="font-medium text-foreground">
                      {formatPence(inv.amount_pence)}
                    </span>
                  )}
                  {inv.site?.name && <span>{inv.site.name}</span>}
                  {inv.is_prepayment && (
                    <Badge variant="outline" className="text-xs">
                      Pre-payment
                    </Badge>
                  )}
                </div>
                {inv.uploader?.full_name && (
                  <p className="text-xs text-muted-foreground">
                    Uploaded by {inv.uploader.full_name}
                  </p>
                )}
              </div>

              {rejectingId === inv.id ? (
                <div className="w-full space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Why is this being rejected?"
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => decide(inv.id, 'rejected', notes)}
                      disabled={pending}
                    >
                      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRejectingId(null)
                        setNotes('')
                      }}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" onClick={() => decide(inv.id, 'approved')} disabled={pending}>
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectingId(inv.id)}
                    disabled={pending}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
