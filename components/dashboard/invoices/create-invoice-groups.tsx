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
import { Loader2, ReceiptText, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatPence } from '@/lib/billing/invoices'
import { createInvoiceFromTasks, type ReadyGroup } from '@/lib/actions/invoices'

export function CreateInvoiceGroups({ groups }: { groups: ReadyGroup[] }) {
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
        <GroupCard key={group.accountId ?? `unassigned-${group.clientName}`} group={group} />
      ))}
    </div>
  )
}

function GroupCard({ group }: { group: ReadyGroup }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.tasks.map((t) => t.id)),
  )
  const [creating, setCreating] = useState(false)

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

  const handleCreate = async () => {
    if (!group.accountId) return
    setCreating(true)
    const res = await createInvoiceFromTasks(group.accountId, Array.from(selected))
    setCreating(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Draft invoice created')
    if (res.invoiceId) router.push(`/dashboard/invoices/${res.invoiceId}`)
    else router.refresh()
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
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all calls"
                  />
                </TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-center">Parts</TableHead>
                <TableHead className="text-right">Parts total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                      aria-label={`Select call ${t.reference}`}
                    />
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {group.tasks.length} call
            {group.tasks.length === 1 ? '' : 's'} selected. Each call adds a labour
            line to price up.
          </p>
          <Button onClick={handleCreate} disabled={!canCreate || creating}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="mr-2 h-4 w-4" />
            )}
            Create draft invoice
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
