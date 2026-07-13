'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
import { MoreHorizontal, Pencil, Trash2, Search, Package } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { EditPartDialog } from './edit-part-dialog'
import type { Part, NominalCode } from '@/lib/types/database'
import { formatGBP } from '@/lib/utils'

interface PartsTableProps {
  parts: Part[]
  suppliers?: { id: string; name: string }[]
  nominalCodes?: NominalCode[]
}

export function PartsTable({ parts, suppliers = [], nominalCodes = [] }: PartsTableProps) {
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editPart, setEditPart] = useState<Part | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = parts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()),
  )

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
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search parts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <PrintButton targetId="parts-grid" title="Parts" className="ml-auto" />
      </div>

      <div className="rounded-md border">
        <Table id="parts-grid">
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="hidden sm:table-cell">SKU</TableHead>
              <TableHead className="hidden lg:table-cell">Supplier</TableHead>
              <TableHead className="hidden md:table-cell">Unit</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Min level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No parts in the catalogue yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((part) => (
                <TableRow key={part.id}>
                  <TableCell className="font-medium">
                    {part.name}
                    {part.description && (
                      <p className="text-xs font-normal text-muted-foreground line-clamp-1">
                        {part.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {part.sku ?? '-'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {part.supplier?.name ?? '-'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
