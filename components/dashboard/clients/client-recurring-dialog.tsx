'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, FileDown, Repeat, CalendarClock } from 'lucide-react'
import type { Client } from '@/lib/types/database'
import { formatPence } from '@/lib/billing/invoices'
import { formatDateUK } from '@/lib/utils'
import {
  getClientRecurringOverview,
  bulkInvoiceClientRecurring,
  type ClientRecurringOverview,
} from '@/lib/actions/client-recurring'

interface ClientRecurringDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClientRecurringDialog({ client, open, onOpenChange }: ClientRecurringDialogProps) {
  const router = useRouter()
  const [overview, setOverview] = useState<ClientRecurringOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [raising, setRaising] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { overview, error } = await getClientRecurringOverview(client.id)
    if (error) toast.error(error)
    setOverview(overview ?? null)
    setLoading(false)
  }, [client.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleBulkInvoice = async () => {
    setRaising(true)
    const { result, error } = await bulkInvoiceClientRecurring(client.id)
    setRaising(false)
    setConfirmOpen(false)
    if (error) {
      toast.error(error)
      return
    }
    if (!result) return

    const parts: string[] = []
    if (result.raisedGroups > 0) {
      parts.push(
        `Raised ${result.invoiceIds.length} draft invoice${result.invoiceIds.length === 1 ? '' : 's'}`,
      )
    }
    if (result.skippedOnHold > 0) parts.push(`${result.skippedOnHold} on-hold account(s) skipped`)
    if (result.failures.length > 0) parts.push(`${result.failures.length} failed`)

    if (result.failures.length > 0) {
      toast.warning(parts.join(' · '), {
        description: result.failures.map((f) => `${f.accountName}: ${f.error}`).join('\n'),
      })
    } else if (result.invoiceIds.length > 0) {
      toast.success(parts.join(' · '))
    } else {
      toast.info('Nothing was invoiced.')
    }

    if (result.invoiceIds.length === 1) {
      router.push(`/dashboard/invoices/${result.invoiceIds[0]}`)
    } else if (result.invoiceIds.length > 1) {
      router.push('/dashboard/invoices?status=draft')
    } else {
      await load()
    }
  }

  const schedule = overview?.schedule
  const hasDue = (overview?.dueChargeCount ?? 0) > 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recurring billing — {client.name}</DialogTitle>
            <DialogDescription>
              The schedule of active recurring charges and anything due to be invoiced now.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !schedule || schedule.chargeCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Repeat className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                This client has no active recurring charges yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Action bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                <div className="text-sm">
                  {hasDue ? (
                    <span className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      <span>
                        <span className="font-semibold">
                          {formatPence(overview!.dueTotalPence)}
                        </span>{' '}
                        across {overview!.dueChargeCount} charge
                        {overview!.dueChargeCount === 1 ? '' : 's'} due to invoice now
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nothing is due to be invoiced yet.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" asChild>
                    <a
                      href={`/api/clients/${client.id}/recurring-schedule/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileDown className="h-4 w-4" />
                      Schedule PDF
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!hasDue || raising}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Invoice due charges
                  </Button>
                </div>
              </div>

              {/* Schedule grouped by billing account */}
              <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
                {schedule.groups.map((group) => (
                  <div key={group.accountId} className="rounded-md border">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                      <div className="text-sm font-semibold">
                        {group.accountName}
                        {group.sageAccountRef && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Sage {group.sageAccountRef}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {formatPence(group.annualValuePence)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">/ yr</span>
                      </div>
                    </div>
                    <div className="divide-y">
                      {group.rows.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{row.description}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.systemService ? `${row.systemService} · ` : ''}
                              {row.frequencyLabel} · {row.timingLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div className="hidden sm:block">
                              <p className="text-xs text-muted-foreground">Next due</p>
                              <p className="text-xs font-medium">{formatDateUK(row.nextDueDate)}</p>
                            </div>
                            <div className="hidden md:block">
                              <p className="text-xs text-muted-foreground">Covers</p>
                              <p className="text-xs font-medium">{row.coveragePeriod}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Per invoice</p>
                              <p className="text-sm font-semibold tabular-nums">
                                {formatPence(row.perOccurrencePence)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {schedule.chargeCount} active recurring charge
                  {schedule.chargeCount === 1 ? '' : 's'}
                </span>
                <span className="font-semibold">
                  {formatPence(schedule.totalAnnualValuePence)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    total / yr
                  </span>
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invoice all due recurring charges?</AlertDialogTitle>
            <AlertDialogDescription>
              This raises {formatPence(overview?.dueTotalPence ?? 0)} across{' '}
              {overview?.dueChargeCount ?? 0} charge
              {(overview?.dueChargeCount ?? 0) === 1 ? '' : 's'} for {client.name}. One draft invoice
              is created per billing account (grouped by invoice group), which you can review before
              issuing. On-hold accounts are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={raising}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBulkInvoice()
              }}
              disabled={raising}
            >
              {raising ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Raising…
                </>
              ) : (
                'Raise draft invoices'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
