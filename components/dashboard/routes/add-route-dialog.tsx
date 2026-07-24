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
import { Plus, Loader2 } from 'lucide-react'
import { ServiceColorPicker } from '@/components/dashboard/service-types/service-color-picker'
import { RouteDayField } from '@/components/dashboard/routes/route-day-field'
import type { Profile } from '@/lib/types/database'

const DEFAULT_ROUTE_COLOR = '#2563eb'

interface AddRouteDialogProps {
  engineers: Profile[]
}

export function AddRouteDialog({ engineers }: AddRouteDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [mondayAck, setMondayAck] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    assigned_engineer_id: '',
    color: DEFAULT_ROUTE_COLOR,
  })
  const router = useRouter()
  const supabase = createClient()

  // A day must be chosen, and a Monday day needs the bank-holiday override.
  const dayInvalid = dayOfWeek === null || (dayOfWeek === 1 && !mondayAck)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dayInvalid) return
    setLoading(true)

    const { error } = await supabase.from('routes').insert({
      ...formData,
      assigned_engineer_id: formData.assigned_engineer_id || null,
      day_of_week: dayOfWeek,
    })

    setLoading(false)

    if (!error) {
      setOpen(false)
      setDayOfWeek(null)
      setMondayAck(false)
      setFormData({
        name: '',
        description: '',
        assigned_engineer_id: '',
        color: DEFAULT_ROUTE_COLOR,
      })
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Route
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Route</DialogTitle>
            <DialogDescription>
              Create a new geographic route for grouping sites
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Route Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., North London"
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
                placeholder="Describe the coverage area"
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || dayInvalid}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Route'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
