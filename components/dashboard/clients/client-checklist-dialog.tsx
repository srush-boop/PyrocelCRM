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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Trash2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Client,
  ClientChecklistItem,
  ServiceType,
  SystemType,
} from '@/lib/types/database'

interface ClientChecklistDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
  systemTypes: SystemType[]
  serviceTypes: ServiceType[]
}

const ITEM_TYPE_LABELS: Record<ClientChecklistItem['type'], string> = {
  pass_fail: 'Pass / Fail',
  text: 'Text input',
  number: 'Number',
  checkbox: 'Checkbox',
}

export function ClientChecklistDialog({
  client,
  open,
  onOpenChange,
  systemTypes,
  serviceTypes,
}: ClientChecklistDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<ClientChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // New item form state
  const [label, setLabel] = useState('')
  const [type, setType] = useState<ClientChecklistItem['type']>('pass_fail')
  const [required, setRequired] = useState(true)
  const [systemTypeIds, setSystemTypeIds] = useState<string[]>([])
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([])

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_checklist_items')
      .select('*')
      .eq('client_id', client.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      toast.error('Could not load checklist items')
    } else {
      setItems((data || []) as ClientChecklistItem[])
    }
    setLoading(false)
  }, [supabase, client.id])

  useEffect(() => {
    if (open) loadItems()
  }, [open, loadItems])

  function resetForm() {
    setLabel('')
    setType('pass_fail')
    setRequired(true)
    setSystemTypeIds([])
    setServiceTypeIds([])
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  async function handleAdd() {
    if (!label.trim()) {
      toast.error('Enter a label for the checklist item')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('client_checklist_items').insert({
      client_id: client.id,
      label: label.trim(),
      type,
      required,
      system_type_ids: systemTypeIds,
      service_type_ids: serviceTypeIds,
      position: items.length,
    })
    setSaving(false)
    if (error) {
      toast.error('Could not add item')
      return
    }
    toast.success('Checklist item added')
    resetForm()
    loadItems()
    router.refresh()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('client_checklist_items').delete().eq('id', id)
    if (error) {
      toast.error('Could not delete item')
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
    router.refresh()
  }

  function nameFor(list: { id: string; name: string }[], id: string) {
    return list.find((x) => x.id === id)?.name ?? 'Unknown'
  }

  function scopeSummary(item: ClientChecklistItem) {
    const sys =
      item.system_type_ids.length === 0
        ? 'All systems'
        : item.system_type_ids.map((id) => nameFor(systemTypes, id)).join(', ')
    const svc =
      item.service_type_ids.length === 0
        ? 'All services'
        : item.service_type_ids.map((id) => nameFor(serviceTypes, id)).join(', ')
    return `${sys} · ${svc}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Checklist items — {client.name}</DialogTitle>
          <DialogDescription>
            Client-specific checks added to the engineer&apos;s checklist. Scope each item to
            the relevant system(s) and service(s).
          </DialogDescription>
        </DialogHeader>

        {/* Existing items */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Current items</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
              <ListChecks className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No client-specific items yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {ITEM_TYPE_LABELS[item.type]}
                      </Badge>
                      {item.required && (
                        <Badge variant="outline" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{scopeSummary(item)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    aria-label="Delete item"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new item */}
        <div className="space-y-4 rounded-md border bg-muted/30 p-4">
          <h3 className="text-sm font-medium">Add checklist item</h3>

          <div className="grid gap-2">
            <Label htmlFor="cci-label">Label</Label>
            <Input
              id="cci-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Photograph panel event log"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cci-type">Response type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ClientChecklistItem['type'])}>
                <SelectTrigger id="cci-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ITEM_TYPE_LABELS).map(([value, lbl]) => (
                    <SelectItem key={value} value={value}>
                      {lbl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={required}
                  onCheckedChange={(c) => setRequired(c === true)}
                />
                Required
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Systems</Label>
              <p className="text-xs text-muted-foreground">Leave all unticked to apply to every system.</p>
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
              <p className="text-xs text-muted-foreground">Leave all unticked to apply to every service.</p>
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
            Add item
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
