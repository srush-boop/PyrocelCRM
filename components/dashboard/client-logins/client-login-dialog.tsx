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
import { Separator } from '@/components/ui/separator'
import { Loader2, Upload, Copy, Check, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientLogin } from '@/lib/types/database'

/** Client shape with the branding fields used by the branded login page. */
export interface BrandingClient {
  id: string
  name: string
  logo_url: string | null
  login_tagline: string | null
}

interface ClientLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: BrandingClient[]
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

  // Branding state (applies to the whole client, shown on their login page)
  const [tagline, setTagline] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null)
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Sites belonging to the chosen client
  const clientSites = useMemo(
    () => sites.filter((s) => s.client_id === clientId),
    [sites, clientId],
  )

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
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
    setLogoFile(null)
    setLogoPreview(null)
    setCopied(false)
  }, [open, login])

  // Load the selected client's current branding into the form.
  useEffect(() => {
    if (!open) return
    setTagline(selectedClient?.login_tagline || '')
    setSavedLogoUrl(selectedClient?.logo_url || null)
    setLogoFile(null)
    setLogoPreview(null)
  }, [open, selectedClient])

  const handleLogoChange = (file: File | null) => {
    setLogoFile(file)
    setLogoPreview(file ? URL.createObjectURL(file) : null)
  }

  const brandedLoginUrl =
    typeof window !== 'undefined' && clientId
      ? `${window.location.origin}/auth/login/${clientId}`
      : ''

  const copyLoginLink = async () => {
    if (!brandedLoginUrl) return
    try {
      await navigator.clipboard.writeText(brandedLoginUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link.')
    }
  }

  const handleSaveBranding = async () => {
    if (!clientId) return
    setBrandingSaving(true)
    try {
      const fd = new FormData()
      if (logoFile) fd.append('logo', logoFile)
      fd.append('tagline', tagline)
      const res = await fetch(`/api/clients/${clientId}/branding`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not save branding.')
      } else {
        if (data.client?.logo_url) setSavedLogoUrl(data.client.logo_url)
        setLogoFile(null)
        setLogoPreview(null)
        toast.success('Login branding saved.')
        router.refresh()
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setBrandingSaving(false)
    }
  }

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

          {clientId && (
            <>
              <Separator />
              <div className="space-y-3">
                <div>
                  <Label>Login page branding</Label>
                  <p className="text-xs text-muted-foreground">
                    Shown on this client&apos;s branded login page. Applies to all
                    of their logins.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1.5">
                    {logoPreview || savedLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview || savedLogoUrl || '/placeholder.svg'}
                        alt={`${selectedClient?.name ?? 'Client'} logo`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Button asChild variant="outline" size="sm" className="cursor-pointer">
                      <label>
                        <Upload className="mr-2 h-4 w-4" />
                        {savedLogoUrl || logoFile ? 'Change logo' : 'Upload logo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG or SVG, up to 2MB.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-tagline">Tagline</Label>
                  <Input
                    id="cl-tagline"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="e.g. Your compliance, always in view."
                    maxLength={120}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveBranding}
                    disabled={brandingSaving}
                  >
                    {brandingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save branding
                  </Button>
                  {brandedLoginUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyLoginLink}
                      className="gap-2"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? 'Copied link' : 'Copy login link'}
                    </Button>
                  )}
                </div>
              </div>
            </>
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
