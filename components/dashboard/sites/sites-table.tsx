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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MoreHorizontal, Pencil, Trash2, Search, Building2, X } from 'lucide-react'
import { EditSiteDialog } from './edit-site-dialog'
import type { Site, Route } from '@/lib/types/database'
import Link from 'next/link'

interface SitesTableProps {
  sites: (Site & { route: Route | null })[]
  routes: Route[]
}

export function SitesTable({ sites, routes }: SitesTableProps) {
  const [search, setSearch] = useState('')
  const [selectedRoute, setSelectedRoute] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editSite, setEditSite] = useState<(Site & { route: Route | null }) | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredSites = sites.filter((site) => {
    // Text search
    const matchesSearch = 
      site.name.toLowerCase().includes(search.toLowerCase()) ||
      site.address.toLowerCase().includes(search.toLowerCase()) ||
      site.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      site.contact_email?.toLowerCase().includes(search.toLowerCase()) ||
      site.route?.name?.toLowerCase().includes(search.toLowerCase())
    
    // Route filter
    const matchesRoute = selectedRoute === 'all' || 
      (selectedRoute === 'unassigned' ? !site.route_id : site.route_id === selectedRoute)
    
    return matchesSearch && matchesRoute
  })

  const hasActiveFilters = search || selectedRoute !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSelectedRoute('all')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    
    await supabase.from('sites').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={selectedRoute} onValueChange={setSelectedRoute}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by route" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Routes</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Route</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Building2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No sites found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    <Link 
                      href={`/dashboard/sites/${site.id}`}
                      className="font-medium hover:underline"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.address}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {site.contact_name && <p>{site.contact_name}</p>}
                      {site.contact_email && (
                        <p className="text-muted-foreground">{site.contact_email}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {site.route ? (
                      <Badge variant="secondary">{site.route.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Unassigned</span>
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
                        <DropdownMenuItem onClick={() => setEditSite(site)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(site.id)}
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
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this site? This action cannot be undone
              and will remove all associated services and tasks.
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

      {editSite && (
        <EditSiteDialog
          site={editSite}
          routes={routes}
          open={!!editSite}
          onOpenChange={() => setEditSite(null)}
        />
      )}
    </div>
  )
}
