'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { MoreHorizontal, Pencil, Trash2, Search, Building, Plus, ChevronRight, ChevronDown, MapPin, ExternalLink } from 'lucide-react'
import type { Client, Site } from '@/lib/types/database'
import { AddClientDialog } from './add-client-dialog'
import { EditClientDialog } from './edit-client-dialog'

interface ClientsTableProps {
  clients: Client[]
  sitesByClient?: Record<string, Site[]>
}

export function ClientsTable({ clients, sitesByClient = {} }: ClientsTableProps) {
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    client.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    client.contact_email?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('clients').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Client
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No clients found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => {
                const clientSites = sitesByClient[client.id] || []
                const isExpanded = expandedId === client.id
                return (
                  <React.Fragment key={client.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : client.id)}
                    >
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={isExpanded ? 'Collapse sites' : 'Expand sites'}
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedId(isExpanded ? null : client.id)
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{client.contact_name || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{client.contact_email || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{client.contact_phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={clientSites.length > 0 ? 'secondary' : 'outline'}>
                          {clientSites.length}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditClient(client)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteId(client.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <div className="p-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Sites for {client.name}
                            </p>
                            {clientSites.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">
                                No sites assigned to this client yet.
                              </p>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {clientSites.map((site) => (
                                  <Link
                                    key={site.id}
                                    href={`/dashboard/sites/${site.id}`}
                                    className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 transition-colors hover:border-primary hover:bg-primary/5"
                                  >
                                    <div className="flex items-start gap-2 min-w-0">
                                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{site.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{site.address}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge
                                        variant={site.status === 'dead' ? 'destructive' : 'default'}
                                        className="text-xs"
                                      >
                                        {site.status === 'dead' ? 'Dead' : 'Live'}
                                      </Badge>
                                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />

      {editClient && (
        <EditClientDialog
          client={editClient}
          open={!!editClient}
          onOpenChange={(open) => !open && setEditClient(null)}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this client? Sites associated with
              this client will no longer have a client assigned.
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
    </div>
  )
}
