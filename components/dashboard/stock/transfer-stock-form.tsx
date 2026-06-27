'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Part, StockLocation } from '@/lib/types/database'
import type { JobOption } from '@/lib/stock'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ArrowRightLeft, Wrench, Check, ChevronsUpDown, PackagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface TransferStockFormProps {
  parts: Part[]
  locations: StockLocation[]
  jobs: JobOption[]
  defaultFromLocationId: string | null
  // Managers (admin/office) can receive new stock into a location.
  canReceive?: boolean
  // Pre-fill values (e.g. from a "Restock" link on the overview).
  initialPartId?: string | null
  initialToLocationId?: string | null
}

type Mode = 'transfer' | 'usage' | 'receive'

function locationLabel(l: StockLocation) {
  const tag = l.kind === 'van' ? ' (Van)' : l.kind === 'warehouse' ? '' : ''
  // names already include "(Van)" for engineer locations; keep it simple
  return l.name + (l.name.includes('(Van)') ? '' : tag)
}

export function TransferStockForm({
  parts,
  locations,
  jobs,
  defaultFromLocationId,
  canReceive = false,
  initialPartId = null,
  initialToLocationId = null,
}: TransferStockFormProps) {
  const router = useRouter()
  const supabase = createClient()

  // A restock link (?toLocationId=...) lands managers on the Receive tab and
  // everyone else on the Transfer tab with the destination pre-filled.
  const [mode, setMode] = useState<Mode>(
    initialToLocationId && canReceive ? 'receive' : 'transfer',
  )
  const [partId, setPartId] = useState(initialPartId ?? '')
  const [fromLocationId, setFromLocationId] = useState(defaultFromLocationId ?? '')
  const [toLocationId, setToLocationId] = useState(initialToLocationId ?? '')
  const [quantity, setQuantity] = useState('')
  const [jobTaskId, setJobTaskId] = useState('')
  const [jobReference, setJobReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [partOpen, setPartOpen] = useState(false)
  const [jobOpen, setJobOpen] = useState(false)

  const selectedPart = useMemo(
    () => parts.find((p) => p.id === partId) ?? null,
    [parts, partId],
  )

  const resetForm = () => {
    setPartId('')
    setQuantity('')
    setJobTaskId('')
    setJobReference('')
    setNotes('')
    setToLocationId('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const qty = Number.parseInt(quantity, 10)
    if (!partId) return toast.error('Select a part')
    if (!qty || qty <= 0) return toast.error('Enter a quantity greater than zero')

    if (mode === 'transfer') {
      if (!fromLocationId) return toast.error('Select the location to take stock from')
      if (!toLocationId) return toast.error('Select the destination location')
      if (toLocationId === fromLocationId)
        return toast.error('Source and destination must be different')
    } else if (mode === 'usage') {
      if (!fromLocationId) return toast.error('Select the location to take stock from')
      if (!jobTaskId && !jobReference.trim())
        return toast.error('Select a job or enter a job reference')
    } else {
      // receive new stock into a location
      if (!toLocationId) return toast.error('Select the location to receive stock into')
    }

    const movementType = mode === 'receive' ? 'receipt' : mode

    setSubmitting(true)
    const { error } = await supabase.rpc('record_stock_movement', {
      p_part_id: partId,
      p_quantity: qty,
      p_type: movementType,
      p_from_location_id: mode === 'receive' ? null : fromLocationId,
      p_to_location_id: mode === 'usage' ? null : toLocationId,
      p_task_id: mode === 'usage' && jobTaskId ? jobTaskId : null,
      p_job_reference: mode === 'usage' ? jobReference.trim() || null : null,
      p_notes: notes.trim() || null,
    })
    setSubmitting(false)

    if (error) {
      toast.error(error.message || 'Could not record the movement')
      return
    }

    toast.success(
      mode === 'transfer'
        ? 'Stock transferred'
        : mode === 'usage'
          ? 'Stock booked out to the job'
          : 'Stock received',
    )
    resetForm()
    router.refresh()
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Record a movement</CardTitle>
        <CardDescription>
          Stock levels update immediately and the movement is logged for reporting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className={cn('grid w-full', canReceive ? 'grid-cols-3' : 'grid-cols-2')}>
            <TabsTrigger value="transfer" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Transfer
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <Wrench className="h-4 w-4" /> Use on job
            </TabsTrigger>
            {canReceive ? (
              <TabsTrigger value="receive" className="gap-2">
                <PackagePlus className="h-4 w-4" /> Receive
              </TabsTrigger>
            ) : null}
          </TabsList>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Part picker (searchable) */}
            <div className="space-y-2">
              <Label>Part</Label>
              <Popover open={partOpen} onOpenChange={setPartOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={partOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedPart
                      ? `${selectedPart.name}${selectedPart.sku ? ` (${selectedPart.sku})` : ''}`
                      : 'Select a part'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search parts..." />
                    <CommandList>
                      <CommandEmpty>No parts found.</CommandEmpty>
                      <CommandGroup>
                        {parts.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.name} ${p.sku ?? ''}`}
                            onSelect={() => {
                              setPartId(p.id)
                              setPartOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                partId === p.id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="flex-1">{p.name}</span>
                            {p.sku ? (
                              <span className="text-xs text-muted-foreground">{p.sku}</span>
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* From location (transfer / usage only) */}
            {mode !== 'receive' ? (
              <div className="space-y-2">
                <Label>From location</Label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Take stock from..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {locationLabel(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {mode === 'transfer' || mode === 'receive' ? (
              <div className="space-y-2">
                <Label>{mode === 'receive' ? 'Receive into' : 'To location'}</Label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Move stock to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((l) => l.id !== fromLocationId)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {locationLabel(l)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {mode === 'usage' ? (
              <>
                <div className="space-y-2">
                  <Label>Job</Label>
                  <Popover open={jobOpen} onOpenChange={setJobOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={jobOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {jobTaskId
                            ? jobs.find((j) => j.taskId === jobTaskId)?.label ?? 'Selected job'
                            : 'Select the job this part was used on'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search jobs..." />
                        <CommandList>
                          <CommandEmpty>No jobs found.</CommandEmpty>
                          <CommandGroup>
                            {jobs.map((j) => (
                              <CommandItem
                                key={j.taskId}
                                value={j.label}
                                onSelect={() => {
                                  setJobTaskId(j.taskId)
                                  if (j.reference) setJobReference(j.reference)
                                  setJobOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    jobTaskId === j.taskId ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <span className="flex-1 truncate">{j.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-reference">Job reference</Label>
                  <Input
                    id="job-reference"
                    value={jobReference}
                    onChange={(e) => setJobReference(e.target.value)}
                    placeholder="e.g. report or works order reference"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from the selected job&apos;s report where available. You can edit it.
                  </p>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
              {selectedPart ? (
                <p className="text-xs text-muted-foreground">Unit: {selectedPart.unit}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any extra detail about this movement"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting} className="gap-2">
                {mode === 'transfer' ? (
                  <ArrowRightLeft className="h-4 w-4" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                {submitting
                  ? 'Recording...'
                  : mode === 'transfer'
                    ? 'Transfer stock'
                    : 'Book out to job'}
              </Button>
            </div>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  )
}
