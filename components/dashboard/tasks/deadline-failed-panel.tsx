'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Save, Loader2 } from 'lucide-react'
import { setDeadlineFailedReason } from '@/lib/actions/deadline'

interface DeadlineFailedPanelProps {
  taskId: string
  /** Deadline ISO timestamp */
  respondBy: string
  /** Already recorded reason (if any) */
  currentReason: string | null
  currentNote: string | null
  /** Configurable list of reasons from global_config */
  reasons: string[]
  /** All roles see the countdown; office/admin and the assigned engineer can log */
  canLog: boolean
}

export function DeadlineFailedPanel({
  taskId,
  respondBy,
  currentReason,
  currentNote,
  reasons,
  canLog,
}: DeadlineFailedPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState(currentReason ?? '')
  const [note, setNote] = useState(currentNote ?? '')
  const [saved, setSaved] = useState(false)

  const deadline = new Date(respondBy)
  const now = new Date()
  const isOverdue = now > deadline

  // Only show when overdue and either already logged or user can log
  if (!isOverdue) return null
  if (!canLog && !currentReason) return null

  const handleSave = () => {
    if (!reason) {
      toast.error('Select a reason for the missed deadline.')
      return
    }
    startTransition(async () => {
      const { error } = await setDeadlineFailedReason(taskId, reason, note.trim() || null)
      if (error) {
        toast.error(error)
      } else {
        setSaved(true)
        toast.success('Deadline reason saved')
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">Response deadline missed</p>
      </div>

      {canLog ? (
        <>
          <p className="text-xs text-amber-700">
            Log the reason this call was not attended within the required response time.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="deadline-reason" className="text-amber-900">
              Reason *
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="deadline-reason" className="bg-white">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deadline-note" className="text-amber-900">
              Additional note (optional)
            </Label>
            <Textarea
              id="deadline-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any further detail..."
              rows={2}
              className="bg-white resize-none"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={isPending || saved}
            className="gap-2 border-amber-400 bg-white hover:bg-amber-50"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? 'Saved' : 'Save reason'}
          </Button>
        </>
      ) : (
        currentReason && (
          <div className="text-sm text-amber-800">
            <span className="font-medium">Reason: </span>
            {currentReason}
            {currentNote && <p className="mt-1 text-xs">{currentNote}</p>}
          </div>
        )
      )}
    </div>
  )
}
