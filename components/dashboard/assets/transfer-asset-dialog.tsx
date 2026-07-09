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
import { transferAsset } from '@/lib/actions/assets'
import type { Asset, Profile, AssetCheckResult } from '@/lib/types/database'

const STORAGE = '__storage__'

interface TransferAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset
  staff: Pick<Profile, 'id' | 'full_name' | 'email'>[]
  onDone: () => void
}

export function TransferAssetDialog({
  open,
  onOpenChange,
  asset,
  staff,
  onDone,
}: TransferAssetDialogProps) {
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState<string>(asset.assigned_to ?? STORAGE)
  const [storageLocation, setStorageLocation] = useState(asset.storage_location ?? '')
  const [notes, setNotes] = useState('')
  const [doInspection, setDoInspection] = useState(false)
  const [inspectionResult, setInspectionResult] = useState<AssetCheckResult>('pass')
  const [inspectionNotes, setInspectionNotes] = useState('')

  const toStorage = target === STORAGE

  async function handleSave() {
    if (toStorage && !storageLocation.trim()) {
      toast.error('Enter a storage location')
      return
    }
    setSaving(true)
    const res = await transferAsset({
      assetId: asset.id,
      toHolderId: toStorage ? null : target,
      storageLocation: toStorage ? storageLocation.trim() : null,
      notes: notes.trim() || null,
      inspection: doInspection
        ? { result: inspectionResult, notes: inspectionNotes.trim() || null }
        : null,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Could not transfer asset')
      return
    }
    toast.success('Asset transferred')
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer asset</DialogTitle>
          <DialogDescription>
            Reassign to another person or move it into storage. The check schedule stays with the
            asset.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Assign to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STORAGE}>Storage (unassigned)</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {toStorage && (
            <div className="grid gap-2">
              <Label htmlFor="storage-loc">Storage location</Label>
              <Input
                id="storage-loc"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="e.g. Main office cupboard, Van 3"
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="transfer-notes">Notes (optional)</Label>
            <Textarea
              id="transfer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="do-inspection" className="text-sm font-medium">
                Record handover inspection
              </Label>
              <p className="text-xs text-muted-foreground">One-off check logged against the asset.</p>
            </div>
            <Switch id="do-inspection" checked={doInspection} onCheckedChange={setDoInspection} />
          </div>
          {doInspection && (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-2">
                <Label>Inspection result</Label>
                <Select
                  value={inspectionResult}
                  onValueChange={(v) => setInspectionResult(v as AssetCheckResult)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass / OK</SelectItem>
                    <SelectItem value="advisory">Advisory</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="insp-notes">Condition notes</Label>
                <Textarea
                  id="insp-notes"
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  rows={2}
                  placeholder="Condition at handover"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
