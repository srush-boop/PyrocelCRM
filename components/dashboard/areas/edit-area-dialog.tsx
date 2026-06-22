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
import type { Area, Profile } from '@/lib/types/database'

interface EditAreaDialogProps {
  area: Area & { assigned_engineer: Profile | null }
  workers: Profile[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditAreaDialog({ area, workers, open, onOpenChange }: EditAreaDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: area.name,
    description: area.description || '',
    assigned_engineer_id: area.assigned_engineer_id || '',
  })
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const newWorkerId = formData.assigned_engineer_id || null

    const { error } = await supabase
      .from('areas')
      .update({
        ...formData,
        assigned_engineer_id: newWorkerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', area.id)

    if (!error) {
      // Propagate the area's worker to pending tasks of services that rely on
      // the area for their engineer (no direct engineer of their own). Mirrors
      // the route propagation so engineers actually see area-assigned work.
      const { data: areaServices } = await supabase
        .from('site_services')
        .select('id')
        .eq('area_id', area.id)
        .is('assigned_engineer_id', null)

      const serviceIds = (areaServices ?? []).map((s) => (s as { id: string }).id)
      if (serviceIds.length > 0) {
        await supabase
          .from('tasks')
          .update({ assigned_engineer_id: newWorkerId })
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
            <DialogTitle>Edit Area</DialogTitle>
            <DialogDescription>Update area information and the assigned worker</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Area Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="worker">Assigned Worker</Label>
              <Select
                value={formData.assigned_engineer_id}
                onValueChange={(value) => setFormData({ ...formData, assigned_engineer_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.full_name || worker.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
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
