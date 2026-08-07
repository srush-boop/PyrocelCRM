'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { createPurchaseOrder } from '@/app/(dashboard)/dashboard/purchasing/actions'

interface Option {
  id: string
  name: string
}

export function CreatePurchaseOrderDialog({
  suppliers,
  branches,
  defaultBranchId,
}: {
  suppliers: Option[]
  branches: Option[]
  defaultBranchId: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId)
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'Unassigned'

  function handleCreate() {
    startTransition(async () => {
      const res = await createPurchaseOrder({ supplierId, branchId, notes })
      if (!res.ok || !res.poId) {
        toast({
          title: 'Could not create order',
          description: res.error ?? 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      toast({ title: 'Draft purchase order created', description: 'Add lines to complete it.' })
      setOpen(false)
      router.push(`/dashboard/purchasing/${res.poId}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New purchase order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>
            Start a draft order. You can add lines and send it on the next screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={supplierOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn('truncate', !supplierId && 'text-muted-foreground')}>
                    {supplierName}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search suppliers…" />
                  <CommandList>
                    <CommandEmpty>No suppliers found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Unassigned"
                        onSelect={() => {
                          setSupplierId(null)
                          setSupplierOpen(false)
                        }}
                      >
                        <Check
                          className={cn('mr-2 h-4 w-4', supplierId ? 'opacity-0' : 'opacity-100')}
                        />
                        Unassigned
                      </CommandItem>
                      {suppliers.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.name}
                          onSelect={() => {
                            setSupplierId(s.id)
                            setSupplierOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              supplierId === s.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="truncate">{s.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={branchId ?? 'none'}
                onValueChange={(v) => setBranchId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notes (optional)</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal reference or delivery notes…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
