'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveSchedule, deleteSchedule } from '@/lib/actions/assets'
import { CHECK_TYPE_LABELS } from '@/lib/assets'
import type { AssetCheckSchedule, AssetCheckType, AssetCheckResponsible } from '@/lib/types/database'

interface ScheduleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  schedule?: AssetCheckSchedule
  onSaved: () => void
}

export function ScheduleFormDialog({
  open,
  onOpenChange,
  assetId,
  schedule,
  onSaved,
}: ScheduleFormDialogProps) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [checkType, setCheckType] = useState<AssetCheckType>('check')
  const [interval, setInterval] = useState('12')
  const [responsible, setResponsible] = useState<AssetCheckResponsible>('asset_manager')
  const [requiresCert, setRequiresCert] = useState(false)
  const [firstDue, setFirstDue] = useState('')

  useEffect(() => {
    if (open) {
      setName(schedule?.name ?? '')
      setCheckType(schedule?.check_type ?? 'check')
      setInterval(String(schedule?.interval_months ?? 12))
      setResponsible(schedule?.responsible ?? 'asset_manager')
      setRequiresCert(schedule?.requires_certificate ?? false)
      setFirstDue(schedule?.next_due_date ?? '')
    }
  }, [open, schedule])

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Give the check a name')
      return
    }
    const months = Number.parseInt(interval, 10)
    if (!Number.isFinite(months) || months < 1) {
      toast.error('Interval must be at least 1 month')
      return
    }
    setSaving(true)
    const res = await saveSchedule({
      id: schedule?.id,
      asset_id: assetId,
      name: name.trim(),
      check_type: checkType,
      interval_months: months,
      responsible,
      requires_certificate: requiresCert,
      next_due_date: firstDue || null,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Could not save schedule')
      return
    }
    toast.success('Schedule saved')
    onSaved()
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!schedule) return
    setSaving(true)
    const res = await deleteSchedule(schedule.id)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Could not delete')
      return
    }
    toast.success('Schedule removed')
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Edit schedule' : 'Add check schedule'}</DialogTitle>
          <DialogDescription>
            Recurring checks stay with the asset even when it is transferred.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sched-name">Check name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual PAT test, Ladder inspection"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={checkType} onValueChange={(v) => setCheckType(v as AssetCheckType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHECK_TYPE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sched-interval">Every (months)</Label>
              <Input
                id="sched-interval"
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sched-due">First/next due</Label>
              <Input
                id="sched-due"
                type="date"
                value={firstDue}
                onChange={(e) => setFirstDue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Responsible</Label>
            <Select
              value={responsible}
              onValueChange={(v) => setResponsible(v as AssetCheckResponsible)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset_manager">Asset manager</SelectItem>
                <SelectItem value="holder">Current holder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="sched-cert" className="text-sm font-medium">
                Certificate required
              </Label>
              <p className="text-xs text-muted-foreground">Force a document upload on completion.</p>
            </div>
            <Switch id="sched-cert" checked={requiresCert} onCheckedChange={setRequiresCert} />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {schedule ? (
            <Button variant="ghost" className="text-destructive" onClick={handleDelete} disabled={saving}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
