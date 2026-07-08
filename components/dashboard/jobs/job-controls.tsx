'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, ChevronRight, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import {
  JOB_STAGES,
  JOB_STATUSES,
  jobStageMeta,
  nextJobStage,
  previousJobStage,
} from '@/lib/jobs/stages'
import { setJobStage, setJobStatus, markContractReviewed } from '@/app/(dashboard)/dashboard/jobs/actions'
import type { JobStage, JobStatus } from '@/lib/types/database'

interface JobControlsProps {
  jobId: string
  stage: JobStage
  status: JobStatus
  contractReviewedAt: string | null
  reviewerName: string | null
}

export function JobStagePanel({ jobId, stage, status, contractReviewedAt }: JobControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const currentOrder = jobStageMeta(stage).order
  const next = nextJobStage(stage)
  const prev = previousJobStage(stage)
  const gated = stage === 'contract_review' && !contractReviewedAt

  function changeStage(target: JobStage) {
    startTransition(async () => {
      const res = await setJobStage(jobId, target)
      if (res.ok) {
        toast.success('Stage updated')
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
        <CardTitle className="text-base">Delivery stage</CardTitle>
        <Select value={status} onValueChange={(v) => changeStatus(v as JobStatus)} disabled={isPending}>
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
        {/* Stage stepper */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {JOB_STAGES.map((s, i) => {
            const done = s.order < currentOrder
            const active = s.order === currentOrder
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                    active && 'border-primary bg-primary/10 text-primary',
                    done && 'border-border bg-muted text-muted-foreground',
                    !active && !done && 'border-border text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : null}
                  {s.label}
                </span>
                {i < JOB_STAGES.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </li>
            )
          })}
        </ol>

        <p className="text-sm text-muted-foreground">{jobStageMeta(stage).description}</p>

        {gated && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Complete the contract review below before this job can advance.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={isPending || !prev}
            onClick={() => prev && changeStage(prev)}
          >
            Back
          </Button>
          <Button
            disabled={isPending || !next || gated}
            onClick={() => next && changeStage(next)}
          >
            {next ? `Advance to ${jobStageMeta(next).label}` : 'Final stage'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function JobContractReview({
  jobId,
  contractReviewedAt,
  reviewerName,
}: {
  jobId: string
  contractReviewedAt: string | null
  reviewerName: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [checks, setChecks] = useState({ scope: false, price: false, terms: false })
  const allChecked = checks.scope && checks.price && checks.terms

  function markReviewed() {
    startTransition(async () => {
      const res = await markContractReviewed(jobId)
      if (res.ok) {
        toast.success('Contract review recorded')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not record the review')
      }
    })
  }

  const items: { key: keyof typeof checks; label: string }[] = [
    { key: 'scope', label: 'Scope of works confirmed against the accepted quote' },
    { key: 'price', label: 'Contract value, costs and margin verified' },
    { key: 'terms', label: 'Payment terms, programme and customer PO confirmed' },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Contract review</CardTitle>
        {contractReviewedAt ? (
          <Badge variant="secondary" className="gap-1 bg-chart-4/15 text-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Reviewed
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
            Pending
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {contractReviewedAt ? (
          <p className="text-sm text-muted-foreground">
            Signed off{reviewerName ? ` by ${reviewerName}` : ''} on {formatDateUK(contractReviewedAt)}.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checks[item.key]}
                      onChange={(e) => setChecks((c) => ({ ...c, [item.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button onClick={markReviewed} disabled={isPending || !allChecked}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Mark contract reviewed
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
