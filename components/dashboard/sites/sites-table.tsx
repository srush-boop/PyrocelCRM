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
import { StatusBadge } from '@/components/ui/status-badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GridToolbar, GridSearch, GridClearButton } from '@/components/dashboard/grid-header'
import { MoreHorizontal, Pencil, Trash2, Building2 } from 'lucide-react'
import { PrintButton } from '@/components/ui/print-button'
import { EditSiteDialog } from './edit-site-dialog'
import type { Site, Route, Client, Branch, PropertyType, SystemType } from '@/lib/types/database'
import Link from 'next/link'

interface SitesTableProps {
  sites: (Site & { route: Route | null; client: Client | null; branch?: Branch | null })[]
  routes: Route[]
  clients: Client[]
  branches?: Branch[]
  propertyTypes?: PropertyType[]
  systemTypes?: SystemType[]
}

export function SitesTable({
  sites,
  routes,
  clients,
  branches = [],
  propertyTypes = [],
  systemTypes = [],
}: SitesTableProps) {
  const [search, setSearch] = useState('')
  const [selectedRoute, setSelectedRoute] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editSite, setEditSite] = useState<(Site & { route: Route | null; client: Client | null; branch?: Branch | null }) | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredSites = sites.filter((site) => {
    // Text search
    const matchesSearch = 
      site.name.toLowerCase().includes(search.toLowerCase()) ||
      site.address.toLowerCase().includes(search.toLowerCase()) ||
      site.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      site.contact_email?.toLowerCase().includes(search.toLowerCase()) ||
      site.route?.name?.toLowerCase().includes(search.toLowerCase()) ||
      site.client?.name?.toLowerCase().includes(search.toLowerCase())
    
    // Route filter
    const matchesRoute = selectedRoute === 'all' || 
      (selectedRoute === 'unassigned' ? !site.route_id : site.route_id === selectedRoute)
    
    // Client filter
    const matchesClient = selectedClient === 'all' || 
      (selectedClient === 'unassigned' ? !site.client_id : site.client_id === selectedClient)
    
    return matchesSearch && matchesRoute && matchesClient
  })

  const hasActiveFilters = search || selectedRoute !== 'all' || selectedClient !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSelectedRoute('all')
    setSelectedClient('all')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    
    await supabase.from('sites').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <GridToolbar>
        <GridSearch value={search} onChange={setSearch} placeholder="Search sites..." />

        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            <SelectItem value="unassigned">No Client</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {hasActiveFilters && <GridClearButton onClick={clearFilters} />}

        <PrintButton targetId="sites-grid" title="Sites" className="ml-auto" />
      </GridToolbar>

      <div className="rounded-md border">
        <Table id="sites-grid">
          <TableHeader>
            <TableRow>
              <TableHead>Site Name</TableHead>
              <TableHead className="hidden xl:table-cell">CASH ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Client</TableHead>
              {branches.length > 0 && (
                <TableHead className="hidden lg:table-cell">Branch</TableHead>
              )}
              <TableHead className="hidden md:table-cell">Address</TableHead>
              <TableHead className="hidden lg:table-cell">Contact</TableHead>
              <TableHead className="hidden lg:table-cell">Route</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={branches.length > 0 ? 9 : 8} className="h-24 text-center">
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
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm font-mono text-muted-foreground">
                      {site.site_id_cash || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={site.status === 'live' ? 'success' : 'warning'}
                      label={site.status === 'live' ? 'Live' : 'Off-contract'}
                    />
                  </TableCell>
                  <TableCell>
                    {site.client ? (
                      <Badge variant="outline">{site.client.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  {branches.length > 0 && (
                    <TableCell className="hidden lg:table-cell">
                      {site.branch ? (
                        <Badge variant="secondary">{site.branch.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="hidden max-w-[220px] truncate text-muted-foreground md:table-cell">
                    {site.address}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="text-sm">
                      {site.contact_name && <p>{site.contact_name}</p>}
                      {site.contact_email && (
                        <p className="text-muted-foreground">{site.contact_email}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
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
          clients={clients}
          branches={branches}
          propertyTypes={propertyTypes}
          systemTypes={systemTypes}
          open={!!editSite}
          onOpenChange={() => setEditSite(null)}
        />
      )}
    </div>
  )
}
