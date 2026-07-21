'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, ClipboardCheck, Sparkles, ArrowRight, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { JOB_STAGES, JOB_STATUSES, jobStageMeta } from '@/lib/jobs/stages'
import { setJobStage, setJobStatus } from '@/app/(dashboard)/dashboard/jobs/actions'
import type { JobStage, JobStatus } from '@/lib/types/database'

interface JobProgressTrackerProps {
  jobId: string
  stage: JobStage
  status: JobStatus
  contractReviewedAt: string | null
  /** Which stages have real supporting activity (derived server-side). */
  stageDone: Record<JobStage, boolean>
  /** Short evidence label per stage, e.g. "3 POs", "2 calls". */
  stageDetail: Partial<Record<JobStage, string>>
}

/**
 * Clickable progress selector for a job's delivery pipeline. Replaces the old
 * Back/Advance buttons: every stage is directly selectable, and each stage
 * shows a tick when the underlying work has actually been done (derived from
 * POs, booked/completed calls, invoices, etc.). The tracker also suggests the
 * stage the job appears to be at so office staff can keep it in sync with a
 * single click. The contract-review gate is still enforced server-side.
 */
export function JobProgressTracker({
  jobId,
  stage,
  status,
  contractReviewedAt,
  stageDone,
  stageDetail,
}: JobProgressTrackerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Reflect the chosen stage instantly on click so the interaction paints
  // immediately (avoids a long INP while the server action + refresh resolve).
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage)

  const currentOrder = jobStageMeta(optimisticStage).order
  const gated = optimisticStage === 'contract_review' && !contractReviewedAt

  // Suggested stage = the first stage in the pipeline that still has outstanding
  // work. If everything is done we suggest the final stage.
  const firstOutstanding = JOB_STAGES.find((s) => !stageDone[s.key])
  const suggested = firstOutstanding ?? JOB_STAGES[JOB_STAGES.length - 1]
  const showSuggestion = !gated && suggested.order > currentOrder

  function changeStage(target: JobStage) {
    if (target === optimisticStage) return
    startTransition(async () => {
      setOptimisticStage(target)
      const res = await setJobStage(jobId, target)
      if (res.ok) {
        toast.success(`Moved to ${jobStageMeta(target).label}`)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not update stage')
      }
    })
  }

  function changeStatus(target: JobStatus) {
    startTransition(async () => {
      const res = await setJobStatus(jobId, target)
      if (res.ok) {
        toast.success('Status updated')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not update status')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Progress</CardTitle>
        <Select
          value={status}
          onValueChange={(v) => changeStatus(v as JobStatus)}
          disabled={isPending}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clickable stage selector */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {JOB_STAGES.map((s) => {
            const done = stageDone[s.key]
            const active = s.order === currentOrder
            const locked = gated && s.key !== 'contract_review'
            const detail = stageDetail[s.key]
            return (
              <button
                key={s.key}
                type="button"
                disabled={isPending || locked}
                onClick={() => changeStage(s.key)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50',
                  locked && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                      done
                        ? 'border-chart-4 bg-chart-4/15 text-chart-4'
                        : active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40 text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : locked ? <Lock className="h-3 w-3" /> : s.order + 1}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      active ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {detail ?? (active ? 'Current stage' : done ? 'Done' : 'Not started')}
                </span>
              </button>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground text-pretty">
          {jobStageMeta(optimisticStage).description}
        </p>

        {showSuggestion && (
          <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              Activity suggests this job is ready for{' '}
              <strong>{suggested.label}</strong>.
            </span>
            <Button size="sm" disabled={isPending} onClick={() => changeStage(suggested.key)}>
              Move to {suggested.label}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {gated && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Complete the contract review below before this job can advance.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
