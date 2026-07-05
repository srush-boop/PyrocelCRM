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
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MoreHorizontal, Pencil, Trash2, Search, Truck, HardHat, Package } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { EditSupplierDialog } from './edit-supplier-dialog'
import type { ServiceType, Supplier, SupplierType } from '@/lib/types/database'

interface SuppliersTableProps {
  suppliers: Supplier[]
  serviceTypes: Pick<ServiceType, 'id' | 'name'>[]
}

type TypeFilter = 'all' | SupplierType

export function SuppliersTable({ suppliers, serviceTypes }: SuppliersTableProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const serviceNameById = new Map(serviceTypes.map((s) => [s.id, s.name]))

  const filtered = suppliers.filter((s) => {
    const matchesType = typeFilter === 'all' || s.supplier_type === typeFilter
    const term = search.toLowerCase()
    const matchesSearch =
      s.name.toLowerCase().includes(term) ||
      (s.contact_name?.toLowerCase().includes(term) ?? false)
    return matchesType && matchesSearch
  })

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('suppliers').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="product">Product suppliers</TabsTrigger>
            <TabsTrigger value="subcontractor">Sub-contractors</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <PrintButton targetId="suppliers-grid" title="Suppliers" className="ml-auto" />
      </div>

      <div className="rounded-md border">
        <Table id="suppliers-grid">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead className="hidden lg:table-cell">Services / Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Truck className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No suppliers found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((supplier) => {
                const isSub = supplier.supplier_type === 'subcontractor'
                return (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {isSub ? (
                          <HardHat className="h-3 w-3" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {isSub ? 'Sub-contractor' : 'Product'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <div className="text-sm">
                        {supplier.contact_name && <p>{supplier.contact_name}</p>}
                        {supplier.contact_email && (
                          <p className="text-muted-foreground">{supplier.contact_email}</p>
                        )}
                        {!supplier.contact_name && !supplier.contact_email && '-'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {isSub ? (
                        (supplier.service_type_ids?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {supplier.service_type_ids!.slice(0, 3).map((id) => (
                              <Badge key={id} variant="secondary" className="font-normal">
                                {serviceNameById.get(id) ?? 'Service'}
                              </Badge>
                            ))}
                            {supplier.service_type_ids!.length > 3 && (
                              <Badge variant="secondary" className="font-normal">
                                +{supplier.service_type_ids!.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm">No services</span>
                        )
                      ) : (
                        supplier.account_number || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                        {supplier.status === 'active' ? 'Active' : 'Inactive'}
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
                          <DropdownMenuItem onClick={() => setEditSupplier(supplier)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(supplier.id)}
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this supplier? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editSupplier && (
        <EditSupplierDialog
          supplier={editSupplier}
          serviceTypes={serviceTypes}
          open={!!editSupplier}
          onOpenChange={() => setEditSupplier(null)}
        />
      )}
    </div>
  )
}
