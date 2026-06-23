'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Plus, Pencil, Trash2, Layers, Wrench, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import type { SiteSystem, SiteService, ServiceType, SystemType } from '@/lib/types/database'

type ServiceWithType = SiteService & { service_type?: ServiceType }

const UNASSIGNED = '__unassigned__'

interface SiteSystemsManagerProps {
  siteId: string
  siteSystems: SiteSystem[]
  siteServices: ServiceWithType[]
  systemTypes: SystemType[]
}

export function SiteSystemsManager({
  siteId,
  siteSystems,
  siteServices,
  systemTypes,
}: SiteSystemsManagerProps) {
  const router = useRouter()
  const supabase = createClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SiteSystem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    system_type_id: '',
    location: '',
    description: '',
    install_date: '',
  })

  function openAdd() {
    setEditing(null)
    setForm({ name: '', system_type_id: '', location: '', description: '', install_date: '' })
    setDialogOpen(true)
  }

  function openEdit(system: SiteSystem) {
    setEditing(system)
    setForm({
      name: system.name,
      system_type_id: system.system_type_id ?? '',
      location: system.location ?? '',
      description: system.description ?? '',
      install_date: system.install_date ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Enter a system name')
      return
    }
    setSaving(true)
    const payload = {
      site_id: siteId,
      name: form.name.trim(),
      system_type_id: form.system_type_id || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      install_date: form.install_date || null,
    }
    const { error } = editing
      ? await supabase.from('site_systems').update(payload).eq('id', editing.id)
      : await supabase.from('site_systems').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editing ? 'System updated' : 'System added')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!deleteId) return
    // Detach services first so they are not removed, just unassigned.
    await supabase.from('site_services').update({ site_system_id: null }).eq('site_system_id', deleteId)
    const { error } = await supabase.from('site_systems').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('System removed')
    router.refresh()
  }

  async function assignService(serviceId: string, systemId: string | null) {
    const { error } = await supabase
      .from('site_services')
      .update({ site_system_id: systemId })
      .eq('id', serviceId)
    if (error) {
      toast.error(error.message)
      return
    }
    router.refresh()
  }

  // Group services by their site_system_id.
  const servicesBySystem = new Map<string, ServiceWithType[]>()
  const unassigned: ServiceWithType[] = []
  for (const svc of siteServices) {
    if (svc.site_system_id) {
      const list = servicesBySystem.get(svc.site_system_id) ?? []
      list.push(svc)
      servicesBySystem.set(svc.site_system_id, list)
    } else {
      unassigned.push(svc)
    }
  }

  function systemTypeLabel(id: string | null): string | null {
    if (!id) return null
    const st = systemTypes.find((s) => s.id === id)
    if (!st) return null
    return st.code ? `${st.code} — ${st.name}` : st.name
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Systems</h2>
          <p className="text-sm text-muted-foreground">
            The systems installed at this site. Attach services to each system.
          </p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" />
          Add system
        </Button>
      </div>

      {siteSystems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No systems yet</p>
              <p className="text-sm text-muted-foreground">
                Add a system (e.g. Fire Alarm) to start grouping this site&apos;s services.
              </p>
            </div>
            <Button onClick={openAdd} variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Add system
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {siteSystems.map((system) => {
            const services = servicesBySystem.get(system.id) ?? []
            const typeLabel = systemTypeLabel(system.system_type_id)
            return (
              <Card key={system.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      {system.name}
                      {typeLabel && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {typeLabel}
                        </Badge>
                      )}
                    </CardTitle>
                    {(system.location || system.description) && (
                      <CardDescription className="flex flex-col gap-0.5">
                        {system.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {system.location}
                          </span>
                        )}
                        {system.description && <span>{system.description}</span>}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(system)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit system</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(system.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete system</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No services attached.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {services.map((svc) => (
                        <li
                          key={svc.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            {svc.service_type?.name ?? 'Service'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => assignService(svc.id, null)}
                          >
                            Detach
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned services</CardTitle>
            <CardDescription>
              Services on this site not yet attached to a system. Assign each to a system below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {unassigned.map((svc) => (
                <li key={svc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    {svc.service_type?.name ?? 'Service'}
                  </span>
                  <Select
                    value={UNASSIGNED}
                    onValueChange={(value) =>
                      assignService(svc.id, value === UNASSIGNED ? null : value)
                    }
                    disabled={siteSystems.length === 0}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign to system" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {siteSystems.map((system) => (
                        <SelectItem key={system.id} value={system.id}>
                          {system.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit system' : 'Add system'}</DialogTitle>
            <DialogDescription>
              A system installed at this site (e.g. &quot;Fire Alarm — Gent panel&quot;).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="system-name">Name</Label>
              <Input
                id="system-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Fire Alarm — main panel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-type">System type</Label>
              <Select
                value={form.system_type_id}
                onValueChange={(value) => setForm({ ...form, system_type_id: value })}
              >
                <SelectTrigger id="system-type">
                  <SelectValue placeholder="Select a system type" />
                </SelectTrigger>
                <SelectContent>
                  {systemTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.code ? `${st.code} — ${st.name}` : st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-location">Location</Label>
              <Input
                id="system-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Ground floor reception"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-install">Install date</Label>
              <Input
                id="system-install"
                type="date"
                value={form.install_date}
                onChange={(e) => setForm({ ...form, install_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-desc">Notes</Label>
              <Textarea
                id="system-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Add system'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this system?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will be deleted. Any attached services are kept but become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
