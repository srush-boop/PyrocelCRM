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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { ServiceColorPicker } from '@/components/dashboard/service-types/service-color-picker'
import { RouteDayField } from '@/components/dashboard/routes/route-day-field'
import { routeWeekday } from '@/lib/routes/route-schedule'
import type { Route, Profile } from '@/lib/types/database'

interface EditRouteDialogProps {
  route: Route & { assigned_engineer: Profile | null }
  engineers: Profile[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditRouteDialog({ route, engineers, open, onOpenChange }: EditRouteDialogProps) {
  const [loading, setLoading] = useState(false)
  const initialDay = routeWeekday(route)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(initialDay)
  // Pre-acknowledge if the route is already saved as Monday, so editing other
  // fields doesn't force a re-tick; switching to Monday still requires it.
  const [mondayAck, setMondayAck] = useState(initialDay === 1)
  const [formData, setFormData] = useState({
    name: route.name,
    description: route.description || '',
    assigned_engineer_id: route.assigned_engineer_id || '',
    color: route.color || '#2563eb',
  })
  const router = useRouter()
  const supabase = createClient()

  const dayInvalid = dayOfWeek === null || (dayOfWeek === 1 && !mondayAck)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dayInvalid) return
    setLoading(true)

    const newEngineerId = formData.assigned_engineer_id || null

    const { error } = await supabase
      .from('routes')
      .update({
        ...formData,
        assigned_engineer_id: newEngineerId,
        day_of_week: dayOfWeek,
        updated_at: new Date().toISOString(),
      })
      .eq('id', route.id)

    if (!error) {
      // Propagate the route's engineer to pending tasks of services that rely
      // on the route for their engineer (i.e. have no direct engineer of their
      // own). Engineers query tasks by assigned_engineer_id, so without this
      // they would never see route-assigned work.
      const { data: routeServices } = await supabase
        .from('site_services')
        .select('id')
        .eq('route_id', route.id)
        .is('assigned_engineer_id', null)

      const serviceIds = (routeServices ?? []).map((s) => (s as { id: string }).id)
      if (serviceIds.length > 0) {
        await supabase
          .from('tasks')
          .update({ assigned_engineer_id: newEngineerId })
          .in('site_service_id', serviceIds)
          .eq('status', 'pending')
      }
    }

    setLoading(false)

    if (!error) {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Route</DialogTitle>
            <DialogDescription>
              Update route information and assignments
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Route Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <RouteDayField
              value={dayOfWeek}
              onChange={setDayOfWeek}
              mondayAck={mondayAck}
              onMondayAckChange={setMondayAck}
            />
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="engineer">Assign Engineer</Label>
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
            <ServiceColorPicker
              value={formData.color}
              onChange={(color) => setFormData({ ...formData, color })}
              label="Calendar colour"
              description="Distinguishes this route on the master calendar."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || dayInvalid}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
