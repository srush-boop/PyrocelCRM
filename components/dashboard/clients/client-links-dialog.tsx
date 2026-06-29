'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Plus, Trash2, Link2, ExternalLink, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Client, ClientLink, ServiceType, SystemType } from '@/lib/types/database'

interface ClientLinksDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
  systemTypes: SystemType[]
  serviceTypes: ServiceType[]
}

// Accepts bare domains too; we normalise to https:// on save.
function normaliseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function ClientLinksDialog({
  client,
  open,
  onOpenChange,
  systemTypes,
  serviceTypes,
}: ClientLinksDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [links, setLinks] = useState<ClientLink[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // New link form state
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [sendable, setSendable] = useState(true)
  const [systemTypeIds, setSystemTypeIds] = useState<string[]>([])
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([])

  const loadLinks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_links')
      .select('*')
      .eq('client_id', client.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      toast.error('Could not load links')
    } else {
      setLinks((data || []) as ClientLink[])
    }
    setLoading(false)
  }, [supabase, client.id])

  useEffect(() => {
    if (open) loadLinks()
  }, [open, loadLinks])

  function resetForm() {
    setLabel('')
    setUrl('')
    setDescription('')
    setSendable(true)
    setSystemTypeIds([])
    setServiceTypeIds([])
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  async function handleAdd() {
    if (!label.trim()) {
      toast.error('Enter a label for the link')
      return
    }
    const finalUrl = normaliseUrl(url)
    if (!finalUrl) {
      toast.error('Enter a URL')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('client_links').insert({
      client_id: client.id,
      label: label.trim(),
      url: finalUrl,
      description: description.trim() || null,
      sendable_to_engineers: sendable,
      system_type_ids: systemTypeIds,
      service_type_ids: serviceTypeIds,
      position: links.length,
    })
    setSaving(false)
    if (error) {
      toast.error('Could not add link')
      return
    }
    toast.success('Link added')
    resetForm()
    loadLinks()
    router.refresh()
  }

  async function handleToggleSendable(link: ClientLink) {
    const next = !link.sendable_to_engineers
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, sendable_to_engineers: next } : l)),
    )
    const { error } = await supabase
      .from('client_links')
      .update({ sendable_to_engineers: next })
      .eq('id', link.id)
    if (error) {
      toast.error('Could not update link')
      loadLinks()
      return
    }
    router.refresh()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('client_links').delete().eq('id', id)
    if (error) {
      toast.error('Could not delete link')
      return
    }
    setLinks((prev) => prev.filter((l) => l.id !== id))
    router.refresh()
  }

  function nameFor(list: { id: string; name: string }[], id: string) {
    return list.find((x) => x.id === id)?.name ?? 'Unknown'
  }

  function scopeSummary(link: ClientLink) {
    const sys =
      link.system_type_ids.length === 0
        ? 'All systems'
        : link.system_type_ids.map((id) => nameFor(systemTypes, id)).join(', ')
    const svc =
      link.service_type_ids.length === 0
        ? 'All services'
        : link.service_type_ids.map((id) => nameFor(serviceTypes, id)).join(', ')
    return `${sys} · ${svc}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Links — {client.name}</DialogTitle>
          <DialogDescription>
            Reference URLs for this client. Links marked as visible to engineers appear on
            matching tasks, scoped to the chosen system(s) and service(s).
          </DialogDescription>
        </DialogHeader>

        {/* Existing links */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Current links</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
              <Link2 className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No links yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {link.label}
                      </a>
                      {link.sendable_to_engineers ? (
                        <Badge variant="secondary" className="text-xs">
                          Visible to engineers
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <EyeOff className="h-3 w-3" />
                          Office only
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                    {link.description && (
                      <p className="text-xs text-muted-foreground">{link.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{scopeSummary(link)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={link.sendable_to_engineers}
                        onCheckedChange={() => handleToggleSendable(link)}
                        aria-label="Visible to engineers"
                      />
                      Send
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label="Delete link"
                      onClick={() => handleDelete(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new link */}
        <div className="space-y-4 rounded-md border bg-muted/30 p-4">
          <h3 className="text-sm font-medium">Add link</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cl-label">Label</Label>
              <Input
                id="cl-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Site access procedure"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cl-url">URL</Label>
              <Input
                id="cl-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cl-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about what this link is for"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendable} onCheckedChange={(c) => setSendable(c === true)} />
            Make available to engineers on matching tasks
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Systems</Label>
              <p className="text-xs text-muted-foreground">
                Leave all unticked to apply to every system.
              </p>
              <div className="space-y-1.5 rounded-md border bg-background p-3">
                {systemTypes.map((st) => (
                  <label key={st.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={systemTypeIds.includes(st.id)}
                      onCheckedChange={() => setSystemTypeIds((prev) => toggle(prev, st.id))}
                    />
                    {st.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Service types</Label>
              <p className="text-xs text-muted-foreground">
                Leave all unticked to apply to every service.
              </p>
              <div className="space-y-1.5 rounded-md border bg-background p-3">
                {serviceTypes.map((svc) => (
                  <label key={svc.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={serviceTypeIds.includes(svc.id)}
                      onCheckedChange={() => setServiceTypeIds((prev) => toggle(prev, svc.id))}
                    />
                    {svc.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={handleAdd} disabled={saving || !label.trim()} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add link
          </Button>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
