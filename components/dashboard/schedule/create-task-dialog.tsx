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
}

const ALL_VISITS = '__all__'

export function CreateTaskDialog({ siteServices, engineers }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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

  // When a site service is picked, load its service type's visit types so the
  // user can schedule a specific visit (e.g. Annual vs Periodic).
  const handleServiceChange = async (siteServiceId: string) => {
    setFormData({ ...formData, site_service_id: siteServiceId })
    setVisitTypeId(ALL_VISITS)
    const ss = siteServices.find((s) => s.id === siteServiceId)
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
      setFormData({
        site_service_id: '',
        assigned_engineer_id: '',
        scheduled_date: new Date(),
        booked_start_time: '',
        booked_end_time: '',
      })
      setVisitTypes([])
      setVisitTypeId(ALL_VISITS)
      router.refresh()
    }
  }

  // Group site services by site
  const siteServicesBySite = siteServices.reduce((acc, ss) => {
    const siteName = ss.site?.name || 'Unknown'
    if (!acc[siteName]) {
      acc[siteName] = []
    }
    acc[siteName].push(ss)
    return acc
  }, {} as Record<string, typeof siteServices>)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <Label>Site & Service *</Label>
              <Select
                value={formData.site_service_id}
                onValueChange={handleServiceChange}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a site service" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(siteServicesBySite).map(([siteName, services]) => (
                    <div key={siteName}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {siteName}
                      </div>
                      {services.map((ss) => (
                        <SelectItem key={ss.id} value={ss.id}>
                          {ss.service_type?.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
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
