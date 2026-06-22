'use client'

import { useState } from 'react'
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
  DropdownMenuSeparator,
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
import { MoreHorizontal, Search, Plus, Trash2, Loader2, Pencil, UserRound } from 'lucide-react'
import { ClientLoginDialog } from './client-login-dialog'
import type { ClientLogin } from '@/lib/types/database'

interface ClientLoginsTableProps {
  logins: ClientLogin[]
  clients: { id: string; name: string }[]
  sites: { id: string; name: string; client_id: string }[]
}

export function ClientLoginsTable({ logins, clients, sites }: ClientLoginsTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClientLogin | null>(null)
  const [deleteLogin, setDeleteLogin] = useState<ClientLogin | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalSitesForClient = (clientId: string | null) =>
    clientId ? sites.filter((s) => s.client_id === clientId).length : 0

  const filtered = logins.filter((l) => {
    const q = search.toLowerCase()
    return (
      (l.full_name || '').toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.client_name || '').toLowerCase().includes(q)
    )
  })

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (login: ClientLogin) => {
    setEditing(login)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteLogin) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/client-users/${deleteLogin.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to delete login.')
      } else {
        setDeleteLogin(null)
        router.refresh()
      }
    } catch {
      alert('An unexpected error occurred.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          New Login
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <UserRound className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No client logins yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((login) => {
                const total = totalSitesForClient(login.client_id)
                const allSites = total > 0 && login.site_ids.length === total
                return (
                  <TableRow key={login.id}>
                    <TableCell className="font-medium">
                      {login.full_name || 'Unnamed'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{login.email}</TableCell>
                    <TableCell>{login.client_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {allSites
                          ? `All sites (${total})`
                          : `${login.site_ids.length} of ${total}`}
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
                          <DropdownMenuItem onClick={() => openEdit(login)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteLogin(login)}
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

      <ClientLoginDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        sites={sites}
        login={editing}
      />

      <AlertDialog open={!!deleteLogin} onOpenChange={(open) => !open && setDeleteLogin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client login?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>{deleteLogin?.full_name || deleteLogin?.email}</strong> and revoke their
              access to the portal. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
