'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackageCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getJobInvoiceData,
  recordJobIssuedItems,
  type JobQuoteLine,
} from '@/lib/actions/job-invoices'

// Lets the office record how much of each physical quote line has been
// issued/delivered to the client. These quantities drive the "issued
// equipment" invoicing mode.
export function RecordIssuedEquipmentButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState<JobQuoteLine[]>([])
  const [qty, setQty] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    const res = await getJobInvoiceData(jobId)
    setLoading(false)
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Could not load job')
      setOpen(false)
      return
    }
    setLines(res.data.lines.filter((l) => !l.isService))
    setQty({})
  }

  const onOpenChange = (v: boolean) => {
    setOpen(v)
    if (v) load()
  }

  const save = async () => {
    const items = Object.entries(qty)
      .map(([quoteLineItemId, q]) => ({ quoteLineItemId, quantity: Number(q) || 0 }))
      .filter((i) => i.quantity !== 0)
    if (!items.length) {
      toast.error('Enter at least one issued quantity')
      return
    }
    setSaving(true)
    const res = await recordJobIssuedItems(jobId, items)
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Issued equipment recorded')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PackageCheck className="mr-2 h-4 w-4" />
          Record issued
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record issued equipment</DialogTitle>
          <DialogDescription>
            Enter the quantity of each item issued/delivered to the client. This adds to any
            previously recorded quantity.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : lines.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            This job has no physical (equipment) quote lines.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Quoted</TableHead>
                  <TableHead className="text-center">Issued</TableHead>
                  <TableHead className="w-28 text-center">Add issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.description}</TableCell>
                    <TableCell className="text-center">{l.quantity}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {l.issuedQty}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={qty[l.id] ?? ''}
                        min={0}
                        onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                        className="h-8 text-center"
                        placeholder="0"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={saving || loading || lines.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
