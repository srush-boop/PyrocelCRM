'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Loader2, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { Profile, SiteService, Site, ServiceType } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface CreateTaskDialogProps {
  siteServices: (SiteService & { site: Site; service_type: ServiceType })[]
  engineers: Profile[]
  clients: { id: string; name: string }[]
}

const ALL_VISITS = '__all__'
// Sentinel for service types that don't belong to a system type, so they remain
// selectable rather than being hidden behind an empty system list.
const NONE_SYSTEM = '__none__'
const NO_CLIENT = '__none__'

export function CreateTaskDialog({ siteServices, engineers, clients }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // Cascading selection: site -> system -> service (which resolves to a site_service).
  const [siteId, setSiteId] = useState('')
  const [systemTypeId, setSystemTypeId] = useState('')
  const [clientId, setClientId] = useState('')
  const [formData, setFormData] = useState({
    site_service_id: '',
    assigned_engineer_id: '',
    scheduled_date: new Date(),
    booked_start_time: '',
    booked_end_time: '',
  })
  // Visit types for the currently-selected service (multi-visit services only),
  // plus which visit the new task is for.
  const [visitTypes, setVisitTypes] = useState<{ id: string; name: string }[]>([])
  const [visitTypeId, setVisitTypeId] = useState<string>(ALL_VISITS)
  const [timeError, setTimeError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Inactive services and dead sites/service types cannot have new calls
  // scheduled — hide them from the pickers.
  const schedulableServices = siteServices.filter((ss) => ss.active !== false)

  // Distinct sites that have at least one schedulable service.
  const sites = Array.from(
    new Map(schedulableServices.map((ss) => [ss.site.id, ss.site])).values(),
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const selectedSite = sites.find((s) => s.id === siteId)

  // Systems available at the selected site, derived from its services.
  const systemsForSite = siteId
    ? Array.from(
        new Map(
          schedulableServices
            .filter((ss) => ss.site_id === siteId)
            .map((ss) => {
              const st = ss.service_type?.system_type
              const key = st?.id ?? NONE_SYSTEM
              return [key, { id: key, name: st?.name ?? 'No system' }]
            }),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : []

  // Services at the selected site + system.
  const servicesForSelection =
    siteId && systemTypeId
      ? schedulableServices.filter(
          (ss) =>
            ss.site_id === siteId &&
            (ss.service_type?.system_type_id ?? NONE_SYSTEM) === systemTypeId,
        )
      : []

  const handleSiteChange = (value: string) => {
    setSiteId(value)
    setSystemTypeId('')
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setFormData((prev) => ({ ...prev, site_service_id: '' }))
    // Default the client to the site's client, but allow it to be overridden.
    const site = sites.find((s) => s.id === value)
    setClientId(site?.client_id ?? '')
  }

  const handleSystemChange = (value: string) => {
    setSystemTypeId(value)
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setFormData((prev) => ({ ...prev, site_service_id: '' }))
  }

  // When a service is picked, load its service type's visit types so the user
  // can schedule a specific visit (e.g. Annual vs Periodic).
  const handleServiceChange = async (siteServiceId: string) => {
    setFormData({ ...formData, site_service_id: siteServiceId })
    setVisitTypeId(ALL_VISITS)
    const ss = schedulableServices.find((s) => s.id === siteServiceId)
    if (!ss?.service_type_id) {
      setVisitTypes([])
      return
    }
    const { data } = await supabase
      .from('service_visit_types')
      .select('id, name, sort_order')
      .eq('service_type_id', ss.service_type_id)
      .order('sort_order', { ascending: true })
    setVisitTypes((data as { id: string; name: string }[]) ?? [])
  }

  const resetForm = () => {
    setSiteId('')
    setSystemTypeId('')
    setClientId('')
    setFormData({
      site_service_id: '',
      assigned_engineer_id: '',
      scheduled_date: new Date(),
      booked_start_time: '',
      booked_end_time: '',
    })
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // If both times are given, end must be after start.
    if (
      formData.booked_start_time &&
      formData.booked_end_time &&
      formData.booked_end_time <= formData.booked_start_time
    ) {
      setTimeError('End time must be after the start time')
      return
    }
    setTimeError(null)
    setLoading(true)

    const { error } = await supabase.from('tasks').insert({
      site_service_id: formData.site_service_id,
      client_id: clientId || null,
      assigned_engineer_id: formData.assigned_engineer_id || null,
      scheduled_date: format(formData.scheduled_date, 'yyyy-MM-dd'),
      booked_start_time: formData.booked_start_time || null,
      booked_end_time: formData.booked_end_time || null,
      status: 'pending',
      visit_type_id: visitTypeId === ALL_VISITS ? null : visitTypeId,
    })

    setLoading(false)

    if (!error) {
      setOpen(false)
      resetForm()
      router.refresh()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Schedule Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Schedule New Task</DialogTitle>
            <DialogDescription>
              Create a new service task for a site
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Site *</Label>
              <Select value={siteId} onValueChange={handleSiteChange} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>System *</Label>
              <Select
                value={systemTypeId}
                onValueChange={handleSystemChange}
                disabled={!siteId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={siteId ? 'Select a system' : 'Select a site first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {systemsForSite.map((sys) => (
                    <SelectItem key={sys.id} value={sys.id}>
                      {sys.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Service Type *</Label>
              <Select
                value={formData.site_service_id}
                onValueChange={handleServiceChange}
                disabled={!systemTypeId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      systemTypeId ? 'Select a service type' : 'Select a system first'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {servicesForSelection.map((ss) => (
                    <SelectItem key={ss.id} value={ss.id}>
                      {ss.service_type?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={clientId || NO_CLIENT}
                onValueChange={(value) => setClientId(value === NO_CLIENT ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSite && (
                <p className="text-xs text-muted-foreground">
                  Defaults to the site&apos;s client. Change it to bill this call to a
                  different client.
                </p>
              )}
            </div>

            {visitTypes.length > 0 && (
              <div className="grid gap-2">
                <Label>Visit</Label>
                <Select value={visitTypeId} onValueChange={setVisitTypeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VISITS}>Unspecified</SelectItem>
                    {visitTypes.map((vt) => (
                      <SelectItem key={vt.id} value={vt.id}>
                        {vt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Assign Engineer</Label>
              <Select
                value={formData.assigned_engineer_id}
                onValueChange={(value) => setFormData({ ...formData, assigned_engineer_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an engineer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.full_name || engineer.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start text-left font-normal',
                      !formData.scheduled_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.scheduled_date ? (
                      format(formData.scheduled_date, 'PPP')
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.scheduled_date}
                    onSelect={(date) => date && setFormData({ ...formData, scheduled_date: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label>Booked Time (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label="Booked start time"
                  value={formData.booked_start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, booked_start_time: e.target.value })
                  }
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label="Booked end time"
                  value={formData.booked_end_time}
                  onChange={(e) =>
                    setFormData({ ...formData, booked_end_time: e.target.value })
                  }
                  className="flex-1"
                />
              </div>
              {timeError ? (
                <p className="text-sm text-destructive">{timeError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add a start and end time to book an appointment slot on the calendar.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.site_service_id}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Schedule Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
