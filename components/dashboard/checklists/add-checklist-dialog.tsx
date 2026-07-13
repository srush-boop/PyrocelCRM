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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Loader2 } from 'lucide-react'
import type { ServiceType } from '@/lib/types/database'

interface AddChecklistDialogProps {
  serviceTypes: ServiceType[]
}

export function AddChecklistDialog({ serviceTypes }: AddChecklistDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  // A checklist can apply to one or many service types. The first selected id is
  // also written to the legacy service_type_id column for backward compatibility.
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  const toggleService = (id: string) =>
    setServiceTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (serviceTypeIds.length === 0) return
    setLoading(true)

    const { data, error } = await supabase
      .from('checklist_templates')
      .insert({
        name,
        service_type_id: serviceTypeIds[0],
        service_type_ids: serviceTypeIds,
        system_type_ids: [],
        items: [],
      })
      .select()
      .single()

    setLoading(false)

    if (!error && data) {
      setOpen(false)
      setName('')
      setServiceTypeIds([])
      router.push(`/dashboard/checklists/${data.id}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Checklist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Checklist Template</DialogTitle>
            <DialogDescription>
              Create a checklist and choose which service type(s) it applies to. You can refine
              the scope and add items after creating it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Checklist Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., General Remedial Work"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Service Types *</Label>
              <p className="text-xs text-muted-foreground">
                Select one or more. The checklist will be offered on tasks for any of these
                services.
              </p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border bg-background p-3">
                {serviceTypes.map((serviceType) => (
                  <label
                    key={serviceType.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={serviceTypeIds.includes(serviceType.id)}
                      onCheckedChange={() => toggleService(serviceType.id)}
                    />
                    {serviceType.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || serviceTypeIds.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create & Edit'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
