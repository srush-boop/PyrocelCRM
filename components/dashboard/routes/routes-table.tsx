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
import { MoreHorizontal, Pencil, Trash2, Search, Route as RouteIcon, Building2, MapPin } from 'lucide-react'
import { EditRouteDialog } from './edit-route-dialog'
import { RoutePlannerDialog, type PlannerSite } from './route-planner-dialog'
import type { Route, Profile } from '@/lib/types/database'

interface RoutesTableProps {
  routes: (Route & { assigned_engineer: Profile | null; siteCount: number })[]
  engineers: Profile[]
  sites: PlannerSite[]
}

export function RoutesTable({ routes, engineers, sites }: RoutesTableProps) {
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editRoute, setEditRoute] = useState<(Route & { assigned_engineer: Profile | null }) | null>(null)
  const [planRoute, setPlanRoute] = useState<(Route & { siteCount: number }) | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredRoutes = routes.filter(
    (route) =>
      route.name.toLowerCase().includes(search.toLowerCase()) ||
      route.assigned_engineer?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    if (!deleteId) return
    
    await supabase.from('routes').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search routes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Assigned Engineer</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRoutes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <RouteIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No routes found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredRoutes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell className="font-medium">{route.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {route.description || '-'}
                  </TableCell>
                  <TableCell>
                    {route.assigned_engineer ? (
                      <Badge variant="secondary">
                        {route.assigned_engineer.full_name || route.assigned_engineer.email}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{route.siteCount}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditRoute(route)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPlanRoute(route)}>
                          <MapPin className="mr-2 h-4 w-4" />
                          Manage sites
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(route.id)}
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
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this route? Sites assigned to this route
              will become unassigned.
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

      {editRoute && (
        <EditRouteDialog
          route={editRoute}
          engineers={engineers}
          open={!!editRoute}
          onOpenChange={() => setEditRoute(null)}
        />
      )}

      {planRoute && (
        <RoutePlannerDialog
          routeId={planRoute.id}
          routeName={planRoute.name}
          sites={sites}
          open={!!planRoute}
          onOpenChange={() => setPlanRoute(null)}
        />
      )}
    </div>
  )
}
