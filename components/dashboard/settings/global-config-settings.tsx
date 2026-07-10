'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { setGlobalConfig } from '@/lib/actions/global-config'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'

interface GlobalConfigSettingsProps {
  poOverdueDays: number
  deadlineReasons: string[]
}

export function GlobalConfigSettings({
  poOverdueDays: initialOverdueDays,
  deadlineReasons: initialReasons,
}: GlobalConfigSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // PO overdue threshold
  const [overdueDays, setOverdueDays] = useState(String(initialOverdueDays))
  const [savingOverdue, setSavingOverdue] = useState(false)

  // Deadline failed reasons list
  const [reasons, setReasons] = useState<string[]>(initialReasons)
  const [newReason, setNewReason] = useState('')
  const [savingReasons, setSavingReasons] = useState(false)

  const saveOverdueDays = async () => {
    const val = parseInt(overdueDays, 10)
    if (isNaN(val) || val < 1) {
      toast.error('Please enter a valid number of days (1 or more)')
      return
    }
    setSavingOverdue(true)
    const { error } = await setGlobalConfig('po_request_overdue_days', val)
    setSavingOverdue(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Overdue threshold saved')
      startTransition(() => router.refresh())
    }
  }

  const addReason = () => {
    const r = newReason.trim()
    if (!r) return
    if (reasons.includes(r)) {
      toast.error('That reason already exists')
      return
    }
    setReasons((prev) => [...prev, r])
    setNewReason('')
  }

  const removeReason = (r: string) => {
    setReasons((prev) => prev.filter((x) => x !== r))
  }

  const saveReasons = async () => {
    if (reasons.length === 0) {
      toast.error('Add at least one reason')
      return
    }
    setSavingReasons(true)
    const { error } = await setGlobalConfig('deadline_failed_reasons', reasons)
    setSavingReasons(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Deadline reasons saved')
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-6">
      {/* PO request overdue threshold */}
      <Card>
        <CardHeader>
          <CardTitle>PO Request Overdue Threshold</CardTitle>
          <CardDescription>
            When a PO request email has been sent and not yet authorised after this many days, it
            will be flagged as overdue in the Chargeable Calls grid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-xs">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="overdue-days">Days until overdue</Label>
              <Input
                id="overdue-days"
                type="number"
                min={1}
                max={365}
                value={overdueDays}
                onChange={(e) => setOverdueDays(e.target.value)}
                className="w-full"
              />
            </div>
            <Button
              onClick={saveOverdueDays}
              disabled={savingOverdue}
              className="gap-2"
            >
              {savingOverdue ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deadline failed reasons */}
      <Card>
        <CardHeader>
          <CardTitle>Deadline Failed Reasons</CardTitle>
          <CardDescription>
            Configurable reasons selectable when a call misses its respond-by deadline. These
            appear in a dropdown on the call overview for office and admin users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {reasons.map((r) => (
              <div key={r} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="text-sm">{r}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeReason(r)}
                  aria-label={`Remove "${r}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {reasons.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No reasons configured yet.</p>
            )}
          </div>

          <Separator />

          <div className="flex gap-2">
            <Input
              placeholder="Add a reason..."
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addReason()
                }
              }}
              className="flex-1"
            />
            <Button variant="outline" onClick={addReason} className="gap-2">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <Button
            onClick={saveReasons}
            disabled={savingReasons}
            className="gap-2"
          >
            {savingReasons ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save reasons
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
