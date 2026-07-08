'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { PauseCircle, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pauseTask, resumeTask } from '@/app/(dashboard)/dashboard/tasks/task-actions'
import type { Task, TaskStatus } from '@/lib/types/database'

interface PauseResumeControlsProps {
  task: Pick<Task, 'id' | 'paused_at' | 'pause_note'>
  status: TaskStatus
  /** Sync the parent flow's local status so the checklist gating updates. */
  onStatusChange: (status: TaskStatus) => void
}

/**
 * Pause / resume controls for an inspection, shared across every execution flow
 * (general task, MCP, damper, extinguisher, emergency light). Pausing is used
 * when an engineer leaves site before completing the work and needs to return
 * another day — progress is preserved and the call moves to the `paused` status
 * (so the map no longer treats them as on site).
 *
 * - in_progress -> shows a "Pause inspection" button with an optional note.
 * - paused      -> shows a banner (with the note / when) + "Resume inspection".
 * - otherwise   -> renders nothing.
 */
export function PauseResumeControls({ task, status, onStatusChange }: PauseResumeControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [note, setNote] = useState('')

  function handlePause() {
    startTransition(async () => {
      const res = await pauseTask(task.id, note)
      if (!res.ok) {
        toast.error(res.error || 'Could not pause the inspection.')
        return
      }
      setDialogOpen(false)
      setNote('')
      onStatusChange('paused')
      toast.success('Inspection paused', {
        description: 'Your progress is saved. Resume when you return to site.',
      })
      router.refresh()
    })
  }

  function handleResume() {
    startTransition(async () => {
      const res = await resumeTask(task.id)
      if (!res.ok) {
        toast.error(res.error || 'Could not resume the inspection.')
        return
      }
      onStatusChange('in_progress')
      toast.success('Inspection resumed')
      router.refresh()
    })
  }

  if (status === 'in_progress') {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 border-amber-500/40 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
          onClick={() => setDialogOpen(true)}
        >
          <PauseCircle className="h-4 w-4" />
          Pause inspection
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pause this inspection?</DialogTitle>
              <DialogDescription>
                Use this if you&apos;re leaving site before finishing and will return another day.
                Your progress is kept and you&apos;ll no longer show as on site.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="pause-note">Handover note (optional)</Label>
              <Textarea
                id="pause-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Completed ground floor; return to test the second-floor panel and the roof detectors."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={handlePause} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                Pause inspection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (status === 'paused') {
    const pausedAgo = task.paused_at
      ? formatDistanceToNow(new Date(task.paused_at), { addSuffix: true })
      : null
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">Inspection paused</p>
            <p className="text-sm text-amber-800/80 dark:text-amber-300/80">
              {pausedAgo ? `Paused ${pausedAgo}. ` : ''}
              Progress is saved. Resume to continue where you left off.
            </p>
            {task.pause_note && (
              <p className="mt-2 rounded-md border border-amber-500/30 bg-background/60 p-2 text-sm text-foreground">
                <span className="font-medium">Handover note: </span>
                {task.pause_note}
              </p>
            )}
          </div>
        </div>
        <Button type="button" onClick={handleResume} disabled={isPending} className="mt-3 w-full gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Resume inspection
        </Button>
      </div>
    )
  }

  return null
}
