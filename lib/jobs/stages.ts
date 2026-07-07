import type { JobStage, JobStatus } from '@/lib/types/database'

/**
 * Built-in job delivery pipeline. Fixed for Phase 1 (can be made configurable
 * later). Order drives progression and the stage stepper in the UI.
 */
export interface JobStageMeta {
  key: JobStage
  label: string
  order: number
  description: string
}

export const JOB_STAGES: JobStageMeta[] = [
  {
    key: 'contract_review',
    label: 'Contract review',
    order: 0,
    description: 'Confirm scope, price and terms before any works are committed.',
  },
  {
    key: 'ordering',
    label: 'Ordering',
    order: 1,
    description: 'Raise purchase orders and procure materials for the job.',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    order: 2,
    description: 'Installation / delivery works are underway on site.',
  },
  {
    key: 'commissioning',
    label: 'Commissioning',
    order: 3,
    description: 'System testing and commissioning ahead of handover.',
  },
  {
    key: 'handover',
    label: 'Handover',
    order: 4,
    description: 'Certification issued and the site handed over to the client.',
  },
  {
    key: 'complete',
    label: 'Complete',
    order: 5,
    description: 'All works finished and the job closed out.',
  },
]

export const JOB_STAGE_KEYS: JobStage[] = JOB_STAGES.map((s) => s.key)

const STAGE_BY_KEY = new Map<JobStage, JobStageMeta>(JOB_STAGES.map((s) => [s.key, s]))

export function jobStageMeta(stage: JobStage): JobStageMeta {
  return STAGE_BY_KEY.get(stage) ?? JOB_STAGES[0]
}

export function jobStageLabel(stage: JobStage): string {
  return jobStageMeta(stage).label
}

export function jobStageOrder(stage: JobStage): number {
  return jobStageMeta(stage).order
}

/** The next stage in the pipeline, or null if already at the end. */
export function nextJobStage(stage: JobStage): JobStage | null {
  const order = jobStageOrder(stage)
  return JOB_STAGES.find((s) => s.order === order + 1)?.key ?? null
}

/** The previous stage in the pipeline, or null if already at the start. */
export function previousJobStage(stage: JobStage): JobStage | null {
  const order = jobStageOrder(stage)
  if (order <= 0) return null
  return JOB_STAGES.find((s) => s.order === order - 1)?.key ?? null
}

export interface JobStatusMeta {
  key: JobStatus
  label: string
  /** Tailwind badge classes (themed tokens only). */
  badgeClass: string
}

export const JOB_STATUSES: JobStatusMeta[] = [
  { key: 'open', label: 'Open', badgeClass: 'bg-primary/10 text-primary border-primary/20' },
  { key: 'on_hold', label: 'On hold', badgeClass: 'bg-muted text-muted-foreground border-border' },
  { key: 'complete', label: 'Complete', badgeClass: 'bg-chart-4/15 text-foreground border-chart-4/30' },
  { key: 'cancelled', label: 'Cancelled', badgeClass: 'bg-destructive/10 text-destructive border-destructive/20' },
]

const STATUS_BY_KEY = new Map<JobStatus, JobStatusMeta>(JOB_STATUSES.map((s) => [s.key, s]))

export function jobStatusMeta(status: JobStatus): JobStatusMeta {
  return STATUS_BY_KEY.get(status) ?? JOB_STATUSES[0]
}

export function jobStatusLabel(status: JobStatus): string {
  return jobStatusMeta(status).label
}

/**
 * Whether a job may leave `contract_review`. The contract-review gate requires
 * the job to have been explicitly signed off (contract_reviewed_at set).
 */
export function canAdvanceFromStage(stage: JobStage, contractReviewedAt: string | null): boolean {
  if (stage === 'contract_review') return !!contractReviewedAt
  return true
}
