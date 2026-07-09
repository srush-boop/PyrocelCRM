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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { disposeAsset } from '@/lib/actions/assets'
import type { Asset } from '@/lib/types/database'

interface DisposeAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset
  onDone: () => void
}

export function DisposeAssetDialog({ open, onOpenChange, asset, onDone }: DisposeAssetDialogProps) {
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [disposalValue, setDisposalValue] = useState('')

  async function handleSave() {
    if (!reason.trim()) {
      toast.error('Enter a disposal reason')
      return
    }
    setSaving(true)
    const res = await disposeAsset({
      assetId: asset.id,
      reason: reason.trim(),
      disposalValue: disposalValue ? Number.parseFloat(disposalValue) : null,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Could not dispose asset')
      return
    }
    toast.success('Asset marked as disposed')
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dispose of {asset.name}</DialogTitle>
          <DialogDescription>
            This marks the asset as disposed, unassigns it and stops its check reminders. History is
            retained.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="dispose-reason">Reason</Label>
            <Textarea
              id="dispose-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. End of life, sold, written off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispose-value">Disposal value (optional)</Label>
            <Input
              id="dispose-value"
              type="number"
              step="0.01"
              min="0"
              value={disposalValue}
              onChange={(e) => setDisposalValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dispose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
