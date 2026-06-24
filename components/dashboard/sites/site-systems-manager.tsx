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
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Pencil, Trash2, Layers, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import type { SiteSystem, SiteService, ServiceType, SystemType } from '@/lib/types/database'

type ServiceWithType = SiteService & { service_type?: ServiceType }

const UNASSIGNED = '__unassigned__'

interface SiteSystemsManagerProps {
  siteId: string
  siteSystems: SiteSystem[]
  siteServices: ServiceWithType[]
  systemTypes: SystemType[]
  availableServiceTypes: ServiceType[]
  siteStatus?: 'live' | 'dead'
}

export function SiteSystemsManager({
  siteId,
  siteSystems,
  siteServices,
  systemTypes,
  availableServiceTypes,
  siteStatus = 'live',
}: SiteSystemsManagerProps) {
  const router = useRouter()
  const supabase = createClient()

  const isDead = siteStatus === 'dead'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SiteSystem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    system_type_id: '',
    description: '',
    install_date: '',
  })

  // Add-services-to-a-system flow
  const [serviceSystemId, setServiceSystemId] = useState<string | null>(null)
  const [serviceSelection, setServiceSelection] = useState<string[]>([])
  const [serviceVisitDate, setServiceVisitDate] = useState('')
  const [addingServices, setAddingServices] = useState(false)

  function systemTypeName(id: string | null): string | null {
    if (!id) return null
    return systemTypes.find((s) => s.id === id)?.name ?? null
  }

  function systemTypeLabel(id: string | null): string | null {
    if (!id) return null
    const st = systemTypes.find((s) => s.id === id)
    if (!st) return null
    return st.code ? `${st.code} — ${st.name}` : st.name
  }

  // Title for a system is its system type; fall back to the stored name for
  // legacy systems created before the type became mandatory.
  function systemTitle(system: SiteSystem): string {
    return systemTypeName(system.system_type_id) ?? system.name ?? 'System'
  }

  function openAdd() {
    setEditing(null)
    setForm({ system_type_id: '', description: '', install_date: '' })
    setDialogOpen(true)
  }

  function openEdit(system: SiteSystem) {
    setEditing(system)
    setForm({
      system_type_id: system.system_type_id ?? '',
      description: system.description ?? '',
      install_date: system.install_date ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.system_type_id) {
      toast.error('Select a system type')
      return
    }
    setSaving(true)
    const payload = {
      site_id: siteId,
      // The system type is the title, so the stored name mirrors it.
      name: systemTypeName(form.system_type_id) ?? 'System',
      system_type_id: form.system_type_id,
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

  function openAddServices(systemId: string) {
    setServiceSystemId(systemId)
    setServiceSelection([])
    setServiceVisitDate(new Date().toISOString().slice(0, 10))
  }

  function toggleServiceType(id: string) {
    setServiceSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Service types available to add, with those matching the system's type
  // sorted to the top (and flagged as suggested) so nothing is hidden.
  function serviceTypesForSystem(system: SiteSystem | undefined): ServiceType[] {
    if (!system) return availableServiceTypes
    return [...availableServiceTypes].sort((a, b) => {
      const am = a.system_type_id === system.system_type_id ? 0 : 1
      const bm = b.system_type_id === system.system_type_id ? 0 : 1
      if (am !== bm) return am - bm
      return a.name.localeCompare(b.name)
    })
  }

  async function handleAddServicesToSystem() {
    if (!serviceSystemId || serviceSelection.length === 0) return
    setAddingServices(true)
    const visitDateStr = serviceVisitDate || new Date().toISOString().slice(0, 10)

    const insertData = serviceSelection.map((serviceTypeId) => {
      const st = availableServiceTypes.find((s) => s.id === serviceTypeId)
      return {
        site_id: siteId,
        service_type_id: serviceTypeId,
        site_system_id: serviceSystemId,
        frequency_value: st?.default_frequency_value ?? 12,
        frequency_unit: st?.default_frequency_unit ?? 'months',
        worker_type: st?.default_worker_type ?? 'cdo',
        next_service_date: isDead ? null : visitDateStr,
      }
    })

    const { data: inserted, error } = await supabase
      .from('site_services')
      .insert(insertData)
      .select('id')

    if (error) {
      setAddingServices(false)
      toast.error(error.message)
      return
    }

    // Live sites get a scheduled task for each new service on the visit date.
    if (!isDead && inserted && inserted.length > 0) {
      const taskData = (inserted as { id: string }[]).map((row) => ({
        site_service_id: row.id,
        scheduled_date: visitDateStr,
        status: 'pending' as const,
      }))
      await supabase.from('tasks').insert(taskData)
    }

    setAddingServices(false)
    setServiceSystemId(null)
    setServiceSelection([])
    toast.success(`Added ${insertData.length} service${insertData.length !== 1 ? 's' : ''}`)
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

  const activeServiceSystem = siteSystems.find((s) => s.id === serviceSystemId)
  const serviceTypeOptions = serviceTypesForSystem(activeServiceSystem)

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
                      {systemTitle(system)}
                      {typeLabel && system.system_type_id && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {systemTypes.find((s) => s.id === system.system_type_id)?.code ?? ''}
                        </Badge>
                      )}
                    </CardTitle>
                    {system.description && (
                      <CardDescription>{system.description}</CardDescription>
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
                <CardContent className="space-y-3">
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAddServices(system.id)}
                    disabled={availableServiceTypes.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    Add service
                  </Button>
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
                          {systemTitle(system)}
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
              The system type is the title. Add an optional description for extra detail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
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
              <Label htmlFor="system-desc">
                Additional description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="system-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Gent panel in ground floor reception"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-install">
                Install date <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="system-install"
                type="date"
                value={form.install_date}
                onChange={(e) => setForm({ ...form, install_date: e.target.value })}
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

      <Dialog
        open={!!serviceSystemId}
        onOpenChange={(open) => !open && setServiceSystemId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add services</DialogTitle>
            <DialogDescription>
              {activeServiceSystem
                ? `Services added here are linked to ${systemTitle(activeServiceSystem)}.`
                : 'Services added here are linked to this system.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {serviceTypeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All service types are already on this site.
              </p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Service types</Label>
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
                    {serviceTypeOptions.map((st) => {
                      const suggested =
                        !!activeServiceSystem &&
                        st.system_type_id === activeServiceSystem.system_type_id
                      return (
                        <label
                          key={st.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                        >
                          <Checkbox
                            checked={serviceSelection.includes(st.id)}
                            onCheckedChange={() => toggleServiceType(st.id)}
                          />
                          <span className="flex-1 text-sm">{st.name}</span>
                          {suggested && (
                            <Badge variant="secondary" className="text-xs">
                              Suggested
                            </Badge>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="service-visit">First visit date</Label>
                  <Input
                    id="service-visit"
                    type="date"
                    value={serviceVisitDate}
                    onChange={(e) => setServiceVisitDate(e.target.value)}
                    disabled={isDead}
                  />
                  {isDead && (
                    <p className="text-xs text-muted-foreground">
                      This site is Dead — services will be added but no visit is scheduled.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setServiceSystemId(null)}
              disabled={addingServices}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddServicesToSystem}
              disabled={serviceSelection.length === 0 || addingServices}
            >
              {addingServices
                ? 'Adding...'
                : `Add ${serviceSelection.length > 0 ? `(${serviceSelection.length})` : ''} service${serviceSelection.length !== 1 ? 's' : ''}`}
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
