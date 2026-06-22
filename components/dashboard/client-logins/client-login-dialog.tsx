'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'
import type { ClientLogin } from '@/lib/types/database'

interface ClientLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: { id: string; name: string }[]
  sites: { id: string; name: string; client_id: string }[]
  /** When provided, the dialog edits this login; otherwise it creates a new one. */
  login?: ClientLogin | null
}

export function ClientLoginDialog({
  open,
  onOpenChange,
  clients,
  sites,
  login,
}: ClientLoginDialogProps) {
  const router = useRouter()
  const isEdit = !!login

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [clientId, setClientId] = useState('')
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sites belonging to the chosen client
  const clientSites = useMemo(
    () => sites.filter((s) => s.client_id === clientId),
    [sites, clientId],
  )

  // Initialise form state whenever the dialog opens
  useEffect(() => {
    if (!open) return
    if (login) {
      setFullName(login.full_name || '')
      setEmail(login.email)
      setClientId(login.client_id || '')
      setSelectedSites(new Set(login.site_ids))
    } else {
      setFullName('')
      setEmail('')
      setClientId('')
      setSelectedSites(new Set())
    }
    setPassword('')
    setError(null)
  }, [open, login])

  // When creating, default to ALL of the chosen client's sites
  const handleClientChange = (value: string) => {
    setClientId(value)
    const all = sites.filter((s) => s.client_id === value).map((s) => s.id)
    setSelectedSites(new Set(all))
  }

  const toggleSite = (siteId: string) => {
    setSelectedSites((prev) => {
      const next = new Set(prev)
      if (next.has(siteId)) next.delete(siteId)
      else next.add(siteId)
      return next
    })
  }

  const allSelected = clientSites.length > 0 && selectedSites.size === clientSites.length
  const toggleAll = () => {
    if (allSelected) setSelectedSites(new Set())
    else setSelectedSites(new Set(clientSites.map((s) => s.id)))
  }

  const handleSubmit = async () => {
    setError(null)
    const siteIds = Array.from(selectedSites)

    if (!isEdit) {
      if (!email || !password || !clientId) {
        setError('Email, password, and client are required.')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
    }
    if (siteIds.length === 0) {
      setError('Select at least one site this login can view.')
      return
    }
    if (isEdit && password && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)
    try {
      const res = isEdit
        ? await fetch(`/api/client-users/${login!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName,
              siteIds,
              ...(password ? { password } : {}),
            }),
          })
        : await fetch('/api/client-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, fullName, clientId, siteIds }),
          })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
      } else {
        onOpenChange(false)
        router.refresh()
      }
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Client Login' : 'New Client Login'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the name, password, or which sites this login can view.'
              : 'Create a read-only login that can view reports for the selected sites.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cl-name">Full name</Label>
            <Input
              id="cl-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Site Facilities Manager"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-email">Email</Label>
            <Input
              id="cl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              disabled={isEdit}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-password">
              {isEdit ? 'New password (leave blank to keep current)' : 'Password'}
            </Label>
            <Input
              id="cl-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Client</Label>
            {isEdit ? (
              <Input value={login?.client_name || 'Unknown client'} disabled />
            ) : (
              <Select value={clientId} onValueChange={handleClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {clientId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Permitted sites</Label>
                {clientSites.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>
              {clientSites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This client has no sites yet.
                </p>
              ) : (
                <ScrollArea className="h-48 rounded-md border p-2">
                  <div className="space-y-1">
                    {clientSites.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedSites.has(s.id)}
                          onCheckedChange={() => toggleSite(s.id)}
                        />
                        <span className="text-sm">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedSites.size} of {clientSites.length} site
                {clientSites.length === 1 ? '' : 's'} selected
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create login'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
