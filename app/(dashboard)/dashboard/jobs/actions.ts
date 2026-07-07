'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canAdvanceFromStage, JOB_STAGE_KEYS } from '@/lib/jobs/stages'
import type { JobStage, JobStatus } from '@/lib/types/database'

const VALID_STAGES = new Set<JobStage>(JOB_STAGE_KEYS)
const VALID_STATUSES = new Set<JobStatus>(['open', 'on_hold', 'complete', 'cancelled'])

// Auth guard mirroring the sales module: staff (admin/office) only.
async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

function revalidateJob(id: string) {
  revalidatePath('/dashboard/jobs')
  revalidatePath('/dashboard/jobs/list')
  revalidatePath(`/dashboard/jobs/${id}`)
}

/** Move a job to a new stage. Enforces the contract-review gate. */
export async function setJobStage(
  id: string,
  stage: JobStage,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!VALID_STAGES.has(stage)) return { ok: false, error: 'Invalid stage.' }

  const { data: job, error: jErr } = await supabase
    .from('jobs')
    .select('stage, contract_reviewed_at')
    .eq('id', id)
    .single()
  if (jErr || !job) return { ok: false, error: 'Job not found.' }

  const current = job.stage as JobStage
  if (current === stage) return { ok: true }

  // Contract-review gate: cannot leave contract_review until it's signed off.
  if (current === 'contract_review' && !canAdvanceFromStage(current, job.contract_reviewed_at)) {
    return { ok: false, error: 'Complete the contract review before advancing this job.' }
  }

  const { error: upErr } = await supabase.from('jobs').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
  if (upErr) {
    console.log('[v0] setJobStage update error:', upErr.message)
    return { ok: false, error: 'Could not update the job stage.' }
  }

  await supabase.from('job_status_history').insert({
    job_id: id,
    from_stage: current,
    to_stage: stage,
    note: 'Stage updated.',
    changed_by: user.id,
  })

  revalidateJob(id)
  return { ok: true }
}

/** Update a job's status (open / on hold / complete / cancelled). */
export async function setJobStatus(
  id: string,
  status: JobStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!VALID_STATUSES.has(status)) return { ok: false, error: 'Invalid status.' }

  const { error: upErr } = await supabase
    .from('jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) {
    console.log('[v0] setJobStatus update error:', upErr.message)
    return { ok: false, error: 'Could not update the job status.' }
  }
  revalidateJob(id)
  return { ok: true }
}

/** Mark the contract review complete (unlocks stage progression). */
export async function markContractReviewed(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: upErr } = await supabase
    .from('jobs')
    .update({
      contract_reviewed_at: new Date().toISOString(),
      contract_reviewed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (upErr) {
    console.log('[v0] markContractReviewed error:', upErr.message)
    return { ok: false, error: 'Could not record the contract review.' }
  }

  await supabase.from('job_status_history').insert({
    job_id: id,
    from_stage: 'contract_review',
    to_stage: 'contract_review',
    note: 'Contract review completed.',
    changed_by: user.id,
  })

  revalidateJob(id)
  return { ok: true }
}

/** Reassign the project manager / owner. */
export async function updateJobOwner(
  id: string,
  ownerId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: upErr } = await supabase
    .from('jobs')
    .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) {
    console.log('[v0] updateJobOwner error:', upErr.message)
    return { ok: false, error: 'Could not reassign the job.' }
  }
  revalidateJob(id)
  return { ok: true }
}
