'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { completeCheck } from '@/lib/actions/assets'
import { CHECK_RESULT_LABELS } from '@/lib/assets'
import type { AssetCheckSchedule, AssetCheckResult } from '@/lib/types/database'

interface CompleteCheckDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: AssetCheckSchedule
  onDone: () => void
}

export function CompleteCheckDialog({
  open,
  onOpenChange,
  schedule,
  onDone,
}: CompleteCheckDialogProps) {
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<AssetCheckResult>('pass')
  const [checkDate, setCheckDate] = useState(new Date().toISOString().slice(0, 10))
  const [calibrationDue, setCalibrationDue] = useState('')
  const [notes, setNotes] = useState('')
  const [certificateUrl, setCertificateUrl] = useState('')
  const [certName, setCertName] = useState('')

  const isCalibration = schedule.check_type === 'calibration' || schedule.check_type === 'test'

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/assets/certificate/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setCertificateUrl(data.url)
      setCertName(file.name)
      toast.success('Certificate uploaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (schedule.requires_certificate && !certificateUrl) {
      toast.error('A certificate is required for this check')
      return
    }
    setSaving(true)
    const res = await completeCheck({
      scheduleId: schedule.id,
      checkDate,
      result,
      notes: notes.trim() || null,
      certificateUrl: certificateUrl || null,
      calibrationDueDate: isCalibration && calibrationDue ? calibrationDue : null,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Could not save check')
      return
    }
    toast.success('Check recorded')
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete: {schedule.name}</DialogTitle>
          <DialogDescription>
            Record the outcome. The next due date is recalculated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="check-date">Date completed</Label>
            <Input
              id="check-date"
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Result</Label>
            <Select value={result} onValueChange={(v) => setResult(v as AssetCheckResult)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHECK_RESULT_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isCalibration && (
            <div className="grid gap-2">
              <Label htmlFor="calib-due">Calibration valid until (optional)</Label>
              <Input
                id="calib-due"
                type="date"
                value={calibrationDue}
                onChange={(e) => setCalibrationDue(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="check-notes">Notes</Label>
            <Textarea
              id="check-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any findings or actions taken"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cert-file">
              Certificate {schedule.requires_certificate && <span className="text-destructive">*</span>}
              {!schedule.requires_certificate && (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Input
              id="cert-file"
              type="file"
              accept="application/pdf,image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
            {uploading && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
              </p>
            )}
            {certName && <p className="text-xs text-muted-foreground">Attached: {certName}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
