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
import { Loader2 } from 'lucide-react'
import type { ServiceType } from '@/lib/types/database'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EditServiceTypeDialogProps {
  serviceType: ServiceType
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditServiceTypeDialog({ serviceType, open, onOpenChange }: EditServiceTypeDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: serviceType.name,
    description: serviceType.description || '',
    default_frequency_value: serviceType.default_frequency_value ?? serviceType.default_frequency_months ?? 12,
    default_frequency_unit: (serviceType.default_frequency_unit || 'months') as 'weeks' | 'months',
  })
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Calculate months equivalent for backwards compatibility
    const frequencyInMonths = formData.default_frequency_unit === 'weeks' 
      ? Math.ceil(formData.default_frequency_value / 4) 
      : formData.default_frequency_value

    const { error } = await supabase
      .from('service_types')
      .update({
        name: formData.name,
        description: formData.description || null,
        default_frequency_months: frequencyInMonths,
        default_frequency_value: formData.default_frequency_value,
        default_frequency_unit: formData.default_frequency_unit,
      })
      .eq('id', serviceType.id)

    setLoading(false)

    if (error) {
      console.error('[v0] Error updating service type:', error)
      alert(`Error updating service type: ${error.message}`)
    } else {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Service Type</DialogTitle>
            <DialogDescription>
              Update service type information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Service Name *</Label>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="frequency-value">Frequency Value *</Label>
                <Input
                  id="frequency-value"
                  type="number"
                  min={1}
                  max={60}
                  value={formData.default_frequency_value}
                  onChange={(e) =>
                    setFormData({ ...formData, default_frequency_value: parseInt(e.target.value) || 12 })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="frequency-unit">Unit *</Label>
                <Select value={formData.default_frequency_unit} onValueChange={(value) =>
                  setFormData({ ...formData, default_frequency_unit: value as 'weeks' | 'months' })
                }>
                  <SelectTrigger id="frequency-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
