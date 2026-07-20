'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ReceiptText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPence } from '@/lib/billing/invoices'
import {
  getJobInvoiceData,
  createJobInvoice,
  type JobInvoiceData,
  type JobQuoteLine,
} from '@/lib/actions/job-invoices'

export function RaiseJobInvoiceButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<JobInvoiceData | null>(null)

  // claim
  const [claimType, setClaimType] = useState<'percent' | 'amount'>('percent')
  const [claimPercent, setClaimPercent] = useState('')
  const [claimAmount, setClaimAmount] = useState('')

  // equipment: quoteLineId -> qty string
  const [equipQty, setEquipQty] = useState<Record<string, string>>({})
  // job lines: selected ids
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const res = await getJobInvoiceData(jobId)
    setLoading(false)
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Could not load job')
      setOpen(false)
      return
    }
    setData(res.data)
    // Pre-fill equipment with the remaining billable quantity. This mirrors the
    // server, which caps equipment lines against the QUOTED quantity (not the
    // separately-recorded "issued" quantity). When issued tracking has been used
    // we prefer the remaining issued amount; otherwise we fall back to the quoted
    // quantity so equipment can still be invoiced without a separate issue step.
    const eq: Record<string, string> = {}
    for (const l of res.data.lines) {
      if (l.isService) continue
      const cap = l.issuedQty > 0 ? l.issuedQty : l.quantity
      const remaining = Math.max(0, cap - l.invoicedQty)
      if (remaining > 0) eq[l.id] = String(remaining)
    }
    setEquipQty(eq)
    setSelectedLines(new Set())
    setClaimType('percent')
    setClaimPercent('')
    setClaimAmount('')
  }

  const onOpenChange = (v: boolean) => {
    setOpen(v)
    if (v) load()
  }

  const submit = async (
    input: Parameters<typeof createJobInvoice>[1],
  ) => {
    setSaving(true)
    const res = await createJobInvoice(jobId, input)
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Draft invoice created')
    setOpen(false)
    if (res.invoiceId) router.push(`/dashboard/invoices/${res.invoiceId}`)
    else router.refresh()
  }

  const equipmentLines = data?.lines.filter((l) => !l.isService) ?? []
  const remainingContract = data
    ? Math.max(0, data.quotedNetPence - data.invoicedNetPence)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ReceiptText className="mr-2 h-4 w-4" />
          Raise invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Raise invoice from job</DialogTitle>
          <DialogDescription>
            {data?.jobNumber ? `${data.jobNumber} — ` : ''}
            Choose what to bill. A draft invoice is created that you can edit before issuing.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data.hasBillingAccount ? (
          <p className="py-6 text-sm text-muted-foreground">
            No billing account is set for this job&apos;s site or client. Set one before invoicing.
          </p>
        ) : (
          <Tabs defaultValue="claim">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="claim">Works to date</TabsTrigger>
              <TabsTrigger value="equipment">Issued equipment</TabsTrigger>
              <TabsTrigger value="lines">Quote lines</TabsTrigger>
            </TabsList>

            {/* Works completed to date claim */}
            <TabsContent value="claim" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Contract value (net)</p>
                  <p className="font-medium">{formatPence(data.quotedNetPence)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Invoiced to date</p>
                  <p className="font-medium">{formatPence(data.invoicedNetPence)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Remaining</p>
                  <p className="font-medium">{formatPence(remainingContract)}</p>
                </div>
              </div>

              <RadioGroup
                value={claimType}
                onValueChange={(v) => setClaimType(v as 'percent' | 'amount')}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="percent" id="claim-percent" />
                  <Label htmlFor="claim-percent">Percent of contract</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="amount" id="claim-amount" />
                  <Label htmlFor="claim-amount">Amount (£)</Label>
                </div>
              </RadioGroup>

              {claimType === 'percent' ? (
                <div>
                  <Label htmlFor="pct" className="text-xs">
                    Percent complete
                  </Label>
                  <Input
                    id="pct"
                    type="number"
                    inputMode="decimal"
                    value={claimPercent}
                    onChange={(e) => setClaimPercent(e.target.value)}
                    placeholder="e.g. 50"
                    className="h-9"
                  />
                  {claimPercent && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ≈{' '}
                      {formatPence(
                        Math.min(
                          remainingContract,
                          Math.round((data.quotedNetPence * (Number(claimPercent) || 0)) / 100),
                        ),
                      )}{' '}
                      (capped at remaining)
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="amt" className="text-xs">
                    Amount to claim (£)
                  </Label>
                  <Input
                    id="amt"
                    type="number"
                    inputMode="decimal"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    className="h-9"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    submit({
                      mode: 'claim',
                      claimType,
                      value:
                        claimType === 'percent'
                          ? Number(claimPercent) || 0
                          : Math.round((Number(claimAmount) || 0) * 100),
                    })
                  }
                  disabled={
                    saving ||
                    remainingContract <= 0 ||
                    (claimType === 'percent' ? !claimPercent : !claimAmount)
                  }
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create draft
                </Button>
              </div>
            </TabsContent>

            {/* Issued equipment */}
            <TabsContent value="equipment" className="space-y-3 pt-2">
              {equipmentLines.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  This job has no physical (equipment) quote lines.
                </p>
              ) : (
                <>
                  <EquipmentTable lines={equipmentLines} qty={equipQty} setQty={setEquipQty} />
                  <div className="flex justify-end">
                    <Button
                      onClick={() =>
                        submit({
                          mode: 'equipment',
                          lines: Object.entries(equipQty)
                            .map(([quoteLineItemId, q]) => ({
                              quoteLineItemId,
                              quantity: Number(q) || 0,
                            }))
                            .filter((l) => l.quantity > 0),
                        })
                      }
                      disabled={
                        saving || !Object.values(equipQty).some((q) => (Number(q) || 0) > 0)
                      }
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create draft
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Selected quote lines */}
            <TabsContent value="lines" className="space-y-3 pt-2">
              <QuoteLinesTable
                lines={data.lines}
                selected={selectedLines}
                onToggle={(id) =>
                  setSelectedLines((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
              />
              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    submit({ mode: 'job_line', quoteLineItemIds: Array.from(selectedLines) })
                  }
                  disabled={saving || selectedLines.size === 0}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create draft
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EquipmentTable({
  lines,
  qty,
  setQty,
}: {
  lines: JobQuoteLine[]
  qty: Record<string, string>
  setQty: (v: Record<string, string>) => void
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-center">Quoted</TableHead>
            <TableHead className="text-center">Issued</TableHead>
            <TableHead className="text-center">Billed</TableHead>
            <TableHead className="w-24 text-center">Invoice qty</TableHead>
            <TableHead className="text-right">Unit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            // Cap on the quoted quantity (matching the server); use issued as the
            // cap only when issued has actually been recorded for the line.
            const cap = l.issuedQty > 0 ? l.issuedQty : l.quantity
            const remaining = Math.max(0, cap - l.invoicedQty)
            return (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.description}</TableCell>
                <TableCell className="text-center">{l.quantity}</TableCell>
                <TableCell className="text-center text-muted-foreground">{l.issuedQty}</TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {l.invoicedQty}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={qty[l.id] ?? ''}
                    max={remaining}
                    min={0}
                    onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                    className="h-8 text-center"
                    disabled={remaining <= 0}
                  />
                </TableCell>
                <TableCell className="text-right">{formatPence(l.unitPricePence)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function QuoteLinesTable({
  lines,
  selected,
  onToggle,
}: {
  lines: JobQuoteLine[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Line</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const alreadyBilled = l.invoicedQty > 0 || l.invoicedPence > 0
            return (
              <TableRow key={l.id} className={alreadyBilled ? 'opacity-60' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(l.id)}
                    onCheckedChange={() => onToggle(l.id)}
                    disabled={alreadyBilled}
                    aria-label={`Select ${l.description}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {l.description}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {l.isService ? 'Service' : 'Equipment'}
                  </span>
                </TableCell>
                <TableCell className="text-center">{l.quantity}</TableCell>
                <TableCell className="text-right">{formatPence(l.lineTotalPence)}</TableCell>
                <TableCell className="text-center text-xs">
                  {alreadyBilled ? (
                    <span className="text-muted-foreground">Invoiced</span>
                  ) : (
                    <span className="text-emerald-600">Available</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
