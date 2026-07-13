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
import { MoreHorizontal, Pencil, Trash2, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import type { ChecklistTemplate, ServiceType, ServiceVisitType, SystemType } from '@/lib/types/database'

interface ChecklistsTableProps {
  checklists: (ChecklistTemplate & {
    service_type: ServiceType
    visit_type?: ServiceVisitType | null
    system_type?: SystemType | null
  })[]
  serviceTypes: ServiceType[]
}

export function ChecklistsTable({ checklists, serviceTypes }: ChecklistsTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const serviceName = (id: string) => serviceTypes.find((s) => s.id === id)?.name

  const handleDelete = async () => {
    if (!deleteId) return
    
    await supabase.from('checklist_templates').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Checklist Name</TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checklists.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <ClipboardList className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No checklists found</p>
                    <p className="text-sm text-muted-foreground">Create a checklist to get started</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              checklists.map((checklist) => (
                <TableRow key={checklist.id}>
                  <TableCell>
                    <Link 
                      href={`/dashboard/checklists/${checklist.id}`}
                      className="font-medium hover:underline"
                    >
                      {checklist.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(checklist.service_type_ids?.length
                        ? checklist.service_type_ids
                        : checklist.service_type_id
                          ? [checklist.service_type_id]
                          : []
                      ).map((id) => (
                        <Badge key={id} variant="secondary">
                          {serviceName(id) ??
                            (id === checklist.service_type_id
                              ? checklist.service_type?.name
                              : null) ??
                            'Unknown'}
                        </Badge>
                      ))}
                      {checklist.visit_type && (
                        <Badge variant="outline">{checklist.visit_type.name}</Badge>
                      )}
                      {checklist.system_type && (
                        <Badge variant="outline">
                          {checklist.system_type.code
                            ? `${checklist.system_type.code} — ${checklist.system_type.name}`
                            : checklist.system_type.name}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {checklist.items.length} items
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/checklists/${checklist.id}`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(checklist.id)}
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this checklist template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
