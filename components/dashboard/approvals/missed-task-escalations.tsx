'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle, BellRing, Check, CheckCircle2, Clock } from 'lucide-react'
import type { InternalTaskInstance } from '@/lib/types/database'
import { remindMissedTask, dismissMissedTaskEscalation } from '@/lib/actions/internal-tasks'

interface Props {
  instances: InternalTaskInstance[]
}

// Central-Approvals-page section listing recurring tasks an assigned user has
// FAILED to complete on time, surfaced to their manager as a notification. The
// manager can send the assignee a reminder (task stays listed) or mark the
// escalation Complete, which dismisses it from the action list.
export function MissedTaskEscalations({ instances }: Props) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  // Track which row an action is running on, for per-row disabled/spinner state.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Optimistically hide dismissed rows so the list updates instantly.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Remember which rows have had a reminder sent this session (for the label).
  const [reminded, setReminded] = useState<Set<string>>(new Set())

  const visible = instances.filter((i) => !dismissed.has(i.id))

  function handleRemind(inst: InternalTaskInstance) {
    setBusyId(inst.id)
    startTransition(async () => {
      const res = await remindMissedTask({ instanceId: inst.id })
      setBusyId(null)
      if (!res.ok) {
        toast({ title: 'Could not send reminder', description: res.error, variant: 'destructive' })
        return
      }
      setReminded((prev) => new Set(prev).add(inst.id))
      toast({
        title: 'Reminder sent',
        description: `${inst.user?.full_name ?? 'The assignee'} has been reminded about "${
          inst.template?.name ?? 'the task'
        }".`,
      })
    })
  }

  function handleComplete(inst: InternalTaskInstance) {
    setBusyId(inst.id)
    startTransition(async () => {
      const res = await dismissMissedTaskEscalation({ instanceId: inst.id })
      setBusyId(null)
      if (!res.ok) {
        toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
        return
      }
      setDismissed((prev) => new Set(prev).add(inst.id))
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Missed recurring tasks</h2>
        {visible.length > 0 && (
          <Badge variant="secondary" className="rounded-full">
            {visible.length}
          </Badge>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No missed recurring tasks. Everyone you manage is on track.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {visible.map((inst) => {
            const rowBusy = pending && busyId === inst.id
            const wasReminded = reminded.has(inst.id) || Boolean(inst.escalation_reminded_at)
            return (
              <div
                key={inst.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {inst.template?.name ?? 'Recurring task'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inst.user?.full_name ?? 'A team member'}
                    {inst.due_at ? ` · due ${formatDate(inst.due_at)}` : ''}
                    {wasReminded ? ' · reminder sent' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    <AlertTriangle className="mr-1 size-3.5" />
                    <Overdue dueAt={inst.due_at} />
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rowBusy}
                    onClick={() => handleRemind(inst)}
                  >
                    <BellRing className="mr-1.5 size-3.5" />
                    {wasReminded ? 'Remind again' : 'Send reminder'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={rowBusy}
                    onClick={() => handleComplete(inst)}
                  >
                    <Check className="mr-1.5 size-3.5" />
                    Complete
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// Human "N days overdue" label from a due date.
function Overdue({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return <>Overdue</>
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24)),
  )
  if (days <= 0) return <>Overdue</>
  return (
    <>
      <Clock className="mr-1 hidden size-3" />
      {days} day{days === 1 ? '' : 's'} overdue
    </>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
