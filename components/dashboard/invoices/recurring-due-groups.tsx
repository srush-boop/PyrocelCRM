'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Loader2, Repeat, AlertTriangle } from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
} from '@/lib/billing/recurring'
import type { RecurringFrequency, RecurringTiming } from '@/lib/types/database'
import {
  createInvoiceFromRecurringCharges,
  type RecurringDueGroup,
} from '@/lib/actions/recurring-invoices'

export function RecurringDueGroups({ groups }: { groups: RecurringDueGroup[] }) {
  if (groups.length === 0) return null

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-tight">Recurring charges due</h2>
        <Badge variant="secondary" className="ml-1">
          {groups.length}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Standing contract charges due for invoicing, grouped by billing account. These are
        raised as separate invoices and never mixed with ad-hoc call charges.
      </p>
      {groups.map((group) => (
        <RecurringGroupCard key={`${group.accountId}::${group.groupKey ?? ''}`} group={group} />
      ))}
    </section>
  )
}

function RecurringGroupCard({ group }: { group: RecurringDueGroup }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.charges.map((c) => c.id)),
  )
  const [creating, setCreating] = useState(false)

  const allSelected = selected.size === group.charges.length
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
    setSelected(allSelected ? new Set() : new Set(group.charges.map((c) => c.id)))
  }

  const selectedTotal = group.charges
    .filter((c) => selected.has(c.id))
    .reduce((s, c) => s + c.amountPence, 0)

  const canCreate = !group.onHold && !noneSelected

  const handleCreate = async () => {
    setCreating(true)
    const res = await createInvoiceFromRecurringCharges(group.accountId, Array.from(selected))
    setCreating(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Draft recurring invoice created')
    if (res.invoiceId) router.push(`/dashboard/invoices/${res.invoiceId}`)
    else router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4" />
              {group.accountName}
              {group.groupKey && (
                <Badge variant="outline" className="ml-1 font-normal">
                  {group.groupKey}
                </Badge>
              )}
            </CardTitle>
            {group.clientName && (
              <p className="mt-0.5 text-sm text-muted-foreground">{group.clientName}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Selected total</p>
            <p className="font-semibold">{formatPence(selectedTotal)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {group.onHold && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Account on hold</AlertTitle>
            <AlertDescription>
              {group.accountName} is {group.accountStatus}. Reactivate the billing account
              before raising an invoice.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all charges"
                  />
                </TableHead>
                <TableHead>Charge</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                      aria-label={`Select ${c.description}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.description}
                    {c.systemService && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {c.systemService}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {c.coveragePeriod}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {RECURRING_FREQUENCY_LABELS[c.frequency as RecurringFrequency] ?? c.frequency}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {RECURRING_TIMING_LABELS[c.timing as RecurringTiming] ?? c.timing}
                  </TableCell>
                  <TableCell className="text-center">{c.quantity}</TableCell>
                  <TableCell className="text-right">{formatPence(c.amountPence)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {group.charges.length} charge
            {group.charges.length === 1 ? '' : 's'} selected.
          </p>
          <Button onClick={handleCreate} disabled={!canCreate || creating}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="mr-2 h-4 w-4" />
            )}
            Create recurring invoice
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
