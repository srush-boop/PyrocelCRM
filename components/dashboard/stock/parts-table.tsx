'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MoreHorizontal, Pencil, Trash2, Search, Package, Percent, X } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { EditPartDialog } from './edit-part-dialog'
import type { Part, NominalCode } from '@/lib/types/database'
import { formatGBP } from '@/lib/utils'
import { bulkAdjustPartCosts } from '@/lib/actions/parts'

interface PartsTableProps {
  parts: Part[]
  suppliers?: { id: string; name: string }[]
  nominalCodes?: NominalCode[]
}

const ALL = '__all__'
const NONE = '__none__'

export function PartsTable({ parts, suppliers = [], nominalCodes = [] }: PartsTableProps) {
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<string>(ALL)
  const [manufacturerFilter, setManufacturerFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editPart, setEditPart] = useState<Part | null>(null)
  // Bulk price change dialog state.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDirection, setBulkDirection] = useState<'increase' | 'decrease'>('increase')
  const [bulkPercent, setBulkPercent] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Distinct manufacturers present in the catalogue, for the filter dropdown.
  const manufacturers = useMemo(() => {
    const set = new Set<string>()
    let hasBlank = false
    for (const p of parts) {
      if (p.manufacturer?.trim()) set.add(p.manufacturer.trim())
      else hasBlank = true
    }
    return { names: Array.from(set).sort((a, b) => a.localeCompare(b)), hasBlank }
  }, [parts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return parts.filter((p) => {
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.manufacturer?.toLowerCase().includes(q)
        if (!hit) return false
      }
      if (supplierFilter === NONE) {
        if (p.supplier_id) return false
      } else if (supplierFilter !== ALL && p.supplier_id !== supplierFilter) {
        return false
      }
      if (manufacturerFilter === NONE) {
        if (p.manufacturer?.trim()) return false
      } else if (
        manufacturerFilter !== ALL &&
        (p.manufacturer?.trim() ?? '') !== manufacturerFilter
      ) {
        return false
      }
      if (statusFilter === 'active' && !p.is_active) return false
      if (statusFilter === 'inactive' && p.is_active) return false
      return true
    })
  }, [parts, search, supplierFilter, manufacturerFilter, statusFilter])

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered])
  const selectedInView = filteredIds.filter((id) => selected.has(id))
  const allSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length
  const someSelected = selectedInView.length > 0 && !allSelected
  const activeFilters =
    supplierFilter !== ALL || manufacturerFilter !== ALL || statusFilter !== 'all' || !!search.trim()

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearFilters = () => {
    setSearch('')
    setSupplierFilter(ALL)
    setManufacturerFilter(ALL)
    setStatusFilter('all')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('parts').delete().eq('id', deleteId)
    if (error) {
      // A part that has been transferred/used can't be hard-deleted (FK restrict).
      setDeleteError(
        'This part has stock movement history and cannot be deleted. Edit it and mark it inactive instead.',
      )
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(deleteId)
      return next
    })
    setDeleteId(null)
    router.refresh()
  }

  const handleBulkApply = async () => {
    const pct = Number.parseFloat(bulkPercent)
    if (!Number.isFinite(pct) || pct <= 0) {
      toast.error('Enter a percentage greater than zero.')
      return
    }
    const signed = bulkDirection === 'increase' ? pct : -pct
    setBulkBusy(true)
    const result = await bulkAdjustPartCosts({
      partIds: Array.from(selected),
      percent: signed,
    })
    setBulkBusy(false)
    if (!result.ok) {
      toast.error(result.error || 'Could not apply the price change.')
      return
    }
    toast.success(
      `Updated ${result.updated} part${result.updated === 1 ? '' : 's'}` +
        (result.catalogueSynced > 0
          ? ` · ${result.catalogueSynced} synced to the quotes catalogue`
          : ''),
    )
    setBulkOpen(false)
    setBulkPercent('')
    setSelected(new Set())
    router.refresh()
  }

  const parsedPct = Number.parseFloat(bulkPercent)
  const previewValid = Number.isFinite(parsedPct) && parsedPct > 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search parts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-full md:w-[190px]">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>No supplier</SelectItem>
          </SelectContent>
        </Select>
        <Select value={manufacturerFilter} onValueChange={setManufacturerFilter}>
          <SelectTrigger className="w-full md:w-[190px]">
            <SelectValue placeholder="Manufacturer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All manufacturers</SelectItem>
            {manufacturers.names.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            {manufacturers.hasBlank && <SelectItem value={NONE}>No manufacturer</SelectItem>}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
        >
          <SelectTrigger className="w-full md:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="md:ml-auto">
            <X className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        )}
        <PrintButton
          targetId="parts-grid"
          title="Parts"
          className={activeFilters ? '' : 'md:ml-auto'}
        />
      </div>

      {/* Selection / bulk action bar */}
      {selectedInView.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedInView.length} selected
          </span>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Percent className="mr-2 h-4 w-4" />
            Apply price change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            className="ml-auto"
          >
            Clear selection
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table id="parts-grid">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all parts"
                  disabled={filteredIds.length === 0}
                />
              </TableHead>
              <TableHead className="w-full">Part</TableHead>
              <TableHead className="hidden whitespace-nowrap md:table-cell">Supplier</TableHead>
              <TableHead className="hidden lg:table-cell">Unit</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Min</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {parts.length === 0
                        ? 'No parts in the catalogue yet'
                        : 'No parts match these filters'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((part) => {
                const subtitle = [part.sku, part.manufacturer].filter(Boolean).join(' · ')
                return (
                  <TableRow key={part.id} data-state={selected.has(part.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(part.id)}
                        onCheckedChange={() => toggleOne(part.id)}
                        aria-label={`Select ${part.name}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-0 font-medium">
                      <div className="truncate">{part.name}</div>
                      {(subtitle || part.description) && (
                        <p className="truncate text-xs font-normal text-muted-foreground">
                          {subtitle}
                          {subtitle && part.description ? ' — ' : ''}
                          {part.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      {part.supplier?.name ?? '-'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {part.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatGBP(part.unit_cost)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {part.default_min_level}
                    </TableCell>
                    <TableCell>
                      <Badge variant={part.is_active ? 'default' : 'secondary'}>
                        {part.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditPart(part)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteId(part.id)
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk price change dialog */}
      <Dialog open={bulkOpen} onOpenChange={(o) => !bulkBusy && setBulkOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply a price change</DialogTitle>
            <DialogDescription>
              Adjust the unit cost of the {selectedInView.length} selected part
              {selectedInView.length === 1 ? '' : 's'} by a percentage. Linked quotes-catalogue
              items are updated and their sell price recalculated at their own margin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Direction</Label>
              <Select
                value={bulkDirection}
                onValueChange={(v) => setBulkDirection(v as 'increase' | 'decrease')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase</SelectItem>
                  <SelectItem value="decrease">Decrease</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-percent">Percentage</Label>
              <div className="relative">
                <Input
                  id="bulk-percent"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="e.g. 5"
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                  className="pr-8"
                />
                <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {previewValid && (
                <p className="text-xs text-muted-foreground">
                  Each cost will be {bulkDirection === 'increase' ? 'increased' : 'decreased'} by{' '}
                  {parsedPct}% (e.g. {formatGBP(100)} becomes{' '}
                  {formatGBP(
                    Math.round(100 * (1 + (bulkDirection === 'increase' ? 1 : -1) * parsedPct / 100) * 100) /
                      100,
                  )}
                  ).
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button onClick={handleBulkApply} disabled={bulkBusy || !previewValid}>
              {bulkBusy ? 'Applying...' : 'Apply price change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={() => {
          setDeleteId(null)
          setDeleteError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                'Are you sure you want to delete this part? Any stock profiles for it will be removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editPart && (
        <EditPartDialog
          part={editPart}
          open={!!editPart}
          onOpenChange={() => setEditPart(null)}
          suppliers={suppliers}
          nominalCodes={nominalCodes}
        />
      )}
    </div>
  )
}
