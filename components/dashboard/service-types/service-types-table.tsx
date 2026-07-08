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
import { MoreHorizontal, Pencil, Trash2, Wrench, Siren } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { EditServiceTypeDialog } from './edit-service-type-dialog'
import { SystemBadge } from '@/lib/system-types'
import type { ServiceType, SystemType } from '@/lib/types/database'

interface ServiceTypesTableProps {
  serviceTypes: ServiceType[]
  systemTypes: SystemType[]
}

export function ServiceTypesTable({ serviceTypes, systemTypes }: ServiceTypesTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editServiceType, setEditServiceType] = useState<ServiceType | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async () => {
    if (!deleteId) return
    
    await supabase.from('service_types').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <PrintButton targetId="service-types-grid" title="Service Types" />
      </div>
      <div className="rounded-md border">
        <Table id="service-types-grid">
          <TableHeader>
            <TableRow>
              <TableHead>Service Name</TableHead>
              <TableHead>System</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Default Frequency</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Wrench className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No service types found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              serviceTypes.map((serviceType) => (
                <TableRow key={serviceType.id}>
                  <TableCell className="font-medium">{serviceType.name}</TableCell>
                  <TableCell>
                    {serviceType.system_type ? (
                      <SystemBadge system={serviceType.system_type} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={(serviceType.status || 'live') === 'live' ? 'default' : 'destructive'}>
                        {serviceType.status || 'live'}
                      </Badge>
                      {serviceType.is_recurring === false && (
                        serviceType.is_emergency ? (
                          <Badge variant="destructive" className="gap-1">
                            <Siren className="h-3 w-3" />
                            Emergency
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Reactive</Badge>
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {serviceType.description || '-'}
                  </TableCell>
                  <TableCell>
                    {serviceType.is_recurring === false ? (
                      <span className="text-muted-foreground">
                        On demand{serviceType.default_kpi_hours ? ` · attend in ${serviceType.default_kpi_hours}h` : ''}
                      </span>
                    ) : (
                      `${serviceType.default_frequency_value} ${serviceType.default_frequency_unit}`
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditServiceType(serviceType)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(serviceType.id)}
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
            <AlertDialogTitle>Delete Service Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this service type? This will also delete
              all associated checklists and tasks.
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

      {editServiceType && (
        <EditServiceTypeDialog
          serviceType={editServiceType}
          systemTypes={systemTypes}
          open={!!editServiceType}
          onOpenChange={() => setEditServiceType(null)}
        />
      )}
    </div>
  )
}
